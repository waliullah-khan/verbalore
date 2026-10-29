import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";
import { serviceClient } from "../src/lib/supabase/service";

// Walks the whole access flow in a real browser: ask, approve as the admin, sign in as the new person, remove them.
// usage: tsx scripts/e2e-access.ts <screenshot dir> <chrome path> <admin sign-in link>
const [out, exe, adminLink] = process.argv.slice(2);
const base = new URL(adminLink).origin;
const email = "e2e-access@example.com";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

async function main() {
  mkdirSync(out, { recursive: true });
  const db = await serviceClient();
  await db.from("vl_access_requests").delete().ilike("email", email);

  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  try {
    // 1. a visitor asks for access
    const visitor = await browser.createBrowserContext();
    const v = await visitor.newPage();
    await v.setViewport({ width: 1200, height: 900 });
    await v.goto(`${base}/login`, { waitUntil: "networkidle2" });
    await v.screenshot({ path: path.join(out, "1-request.png") });

    const submit = async (linkedin: string) => {
      await v.goto(`${base}/login`, { waitUntil: "networkidle2" });
      await v.type("#name", "Ada Tester");
      await v.type("#email", email);
      await v.type("#linkedin", linkedin);
      await v.type("#reason", "Weekly videos for my SaaS");
      await Promise.all([v.waitForNavigation({ waitUntil: "networkidle2" }), v.click("form button.btn-primary")]);
    };

    await submit("https://evil.example.com/in/ada");
    ok((await v.evaluate(() => document.body.innerText)).includes("link to your LinkedIn profile"), "a non-LinkedIn address is turned back with a clear message");
    const none = await db.from("vl_access_requests").select("id").ilike("email", email);
    ok((none.data ?? []).length === 0, "nothing was saved for the bad request");

    await submit("linkedin.com/in/ada-tester");
    ok((await v.evaluate(() => document.body.innerText)).includes("Request received"), "a good request shows the confirmation");
    await v.screenshot({ path: path.join(out, "2-received.png") });
    const saved = await db.from("vl_access_requests").select("status,linkedin_url").ilike("email", email).single();
    ok(saved.data?.status === "pending" && saved.data.linkedin_url === "https://linkedin.com/in/ada-tester", "it is stored as pending with a clean LinkedIn URL");

    // 2. the visitor cannot reach anything yet, and the admin page does not exist for them
    await v.goto(`${base}/admin/access`, { waitUntil: "networkidle2" });
    ok(v.url().includes("/login"), "an anonymous visitor is sent to the login page for /admin/access");
    await v.goto(`${base}/api/capture/x`, { waitUntil: "networkidle2" }).catch(() => undefined);

    // 3. the admin signs in with their personal link and approves
    const adminCtx = await browser.createBrowserContext();
    const a = await adminCtx.newPage();
    await a.setViewport({ width: 1200, height: 1000 });
    await a.goto(adminLink, { waitUntil: "networkidle2" });
    ok(a.url().endsWith("/ideas"), "the admin's personal link signs them in");
    await a.goto(`${base}/admin/access`, { waitUntil: "networkidle2" });
    const listed = await a.evaluate(() => document.body.innerText);
    ok(listed.includes("Ada Tester") && listed.includes("linkedin.com/in/ada-tester"), "the admin sees the request with the LinkedIn profile");
    await a.screenshot({ path: path.join(out, "3-admin-pending.png"), fullPage: true });

    const approveBtn = await a.evaluateHandle(() => {
      const card = Array.from(document.querySelectorAll("li")).find((l) => l.innerText.includes("Ada Tester"))!;
      return Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Approve");
    });
    await Promise.all([a.waitForNetworkIdle({ idleTime: 1500, timeout: 60000 }), (approveBtn as import("puppeteer-core").ElementHandle<HTMLButtonElement>).click()]);
    await a.reload({ waitUntil: "networkidle2" });
    const link = await a.evaluate(() => (Array.from(document.querySelectorAll("li")).find((l) => l.innerText.includes("Ada Tester"))?.querySelector("input[readonly]") as HTMLInputElement | undefined)?.value ?? "");
    ok(/\/access\/[a-f0-9]{48}$/.test(link), "approving shows a personal sign-in link");
    await a.screenshot({ path: path.join(out, "4-admin-approved.png"), fullPage: true });

    // 4. the approved person signs in with the link and has a workspace
    const personCtx = await browser.createBrowserContext();
    const p = await personCtx.newPage();
    await p.setViewport({ width: 1200, height: 900 });
    await p.goto(link, { waitUntil: "networkidle2" });
    ok(p.url().endsWith("/ideas"), "the new person lands on Today after opening their link");
    const body = await p.evaluate(() => document.body.innerText);
    ok(body.includes("Ada") && !body.includes("Access requests"), "they see their own workspace and no admin links");
    await p.screenshot({ path: path.join(out, "5-new-person.png"), fullPage: true });
    const res = await p.goto(`${base}/admin/access`, { waitUntil: "networkidle2" });
    ok(res?.status() === 404, "the admin page is a 404 for them");
    const phone = await personCtx.newPage();
    await phone.setViewport({ width: 390, height: 844, isMobile: true });
    await phone.goto(`${base}/ideas`, { waitUntil: "networkidle2" });
    await phone.screenshot({ path: path.join(out, "6-phone.png") });

    // 5. the admin removes their access
    await a.goto(`${base}/admin/access`, { waitUntil: "networkidle2" });
    const removeBtn = await a.evaluateHandle(() => {
      const card = Array.from(document.querySelectorAll("li")).find((l) => l.innerText.includes("Ada Tester"))!;
      return Array.from(card.querySelectorAll("button")).find((b) => b.textContent === "Remove access");
    });
    await Promise.all([a.waitForNetworkIdle({ idleTime: 1500, timeout: 60000 }), (removeBtn as import("puppeteer-core").ElementHandle<HTMLButtonElement>).click()]);
    const gone = await browser.createBrowserContext();
    const g = await gone.newPage();
    await g.goto(link, { waitUntil: "networkidle2" });
    ok(g.url().includes("/login?error=link"), "after removal the old link no longer works");
    const reloaded = await p.goto(`${base}/ideas`, { waitUntil: "networkidle2" });
    ok(p.url().includes("/login") || reloaded?.status() !== 200, "and their open session stops working");
  } finally {
    await browser.close();
    const { data: r } = await db.from("vl_access_requests").select("user_id").ilike("email", email).maybeSingle();
    if (r?.user_id) {
      const { data: m } = await db.from("vl_members").select("workspace_id").eq("user_id", r.user_id);
      for (const row of m ?? []) {
        await db.from("vl_members").delete().eq("workspace_id", row.workspace_id);
        await db.from("vl_workspaces").delete().eq("id", row.workspace_id);
      }
      await db.auth.admin.deleteUser(r.user_id);
    }
    await db.from("vl_access_requests").delete().ilike("email", email);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
