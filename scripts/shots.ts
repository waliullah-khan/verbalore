import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";
import { serviceClient } from "../src/lib/supabase/service";

// Drives the real UI: a desktop Studio shows a QR code, an emulated phone with a fake camera records,
// sends the take, and the desktop picks it up. Screenshots go to the folder given as the first argument.
const base = "http://localhost:3000";
const out = process.argv[2];
const exe = process.argv[3];
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

async function clickText(page: Page, text: string) {
  const handle = await page.evaluateHandle((t) => Array.from(document.querySelectorAll("button, a, label")).find((e) => e.textContent?.trim().startsWith(t)) ?? null, text);
  const el = handle.asElement() as ElementHandle<Element> | null;
  if (!el) throw new Error(`no element with text "${text}"`);
  await el.click();
}

async function main() {
  mkdirSync(out, { recursive: true });
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("id").eq("is_demo", true).single();
  const { data: idea } = await db.from("vl_ideas").select("id").eq("workspace_id", ws!.id).neq("status", "note").order("score", { ascending: false }).limit(1).single();

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    // desktop
    const desk = await browser.newPage();
    await desk.setViewport({ width: 1280, height: 1000 });
    desk.on("console", (m) => { if (m.type() === "error") console.log("   desk console error:", m.text().slice(0, 160)); });
    desk.on("pageerror", (e) => console.log("   desk page error:", String(e).slice(0, 200)));
    let polls = 0;
    desk.on("response", async (r) => {
      if (!r.url().includes("/api/capture/") || r.url().endsWith("/upload")) return;
      polls++;
      const b = await r.json().catch(() => null);
    });
    await desk.goto(`${base}/demo`, { waitUntil: "networkidle2" });
    await desk.goto(`${base}/studio/${idea!.id}`, { waitUntil: "networkidle2" });
    await clickText(desk, "Show QR code");
    await desk.waitForSelector('[role="img"][aria-label^="QR"] svg', { timeout: 15000 });
    await wait(600);
    await desk.screenshot({ path: path.join(out, "1-desktop-qr.png"), fullPage: true });
    const url = await desk.evaluate(() => Array.from(document.querySelectorAll("p")).map((p) => p.textContent ?? "").find((t) => /\/r\/[0-9a-f]{32}/.test(t)) ?? "");
    const token = url.match(/\/r\/([0-9a-f]{32})/)?.[1];
    ok(!!token, `desktop shows a QR code and link (${url.replace(/[0-9a-f]{32}/, "<token>")})`);
    const svgBox = await desk.evaluate(() => { const s = document.querySelector('[role="img"][aria-label^="QR"] svg'); return s ? s.getBoundingClientRect().width : 0; });
    ok(svgBox > 120, `QR code is large enough to scan (${Math.round(svgBox)}px)`);

    // phone
    const phone = await browser.newPage();
    await phone.emulate({ viewport: { width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1" });
    await phone.goto(`${base}/r/${token}`, { waitUntil: "networkidle2" });
    await phone.waitForSelector('button[aria-label="Start recording"]', { timeout: 15000 });
    await wait(800);
    await phone.screenshot({ path: path.join(out, "2-phone-ready.png") });
    ok(true, "phone page opens with the camera and a start button");
    const noOverflow = await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
    ok(noOverflow, "phone page has no horizontal scroll");

    await phone.click('button[aria-label="Start recording"]');
    await wait(5500);
    await phone.screenshot({ path: path.join(out, "3-phone-recording.png") });
    await phone.waitForSelector('button[aria-label="Stop recording"]', { timeout: 20000 }).catch(async (e) => { await phone.screenshot({ path: path.join(out, "x-stuck.png") }); throw e; });
    await wait(3500);
    await phone.click('button[aria-label="Stop recording"]');
    await phone.waitForFunction(() => Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Send to my computer")), { timeout: 10000 });
    await wait(500);
    await phone.screenshot({ path: path.join(out, "4-phone-review.png") });
    await clickText(phone, "Send to my computer");
    await phone.waitForFunction(() => document.body.innerText.includes("Sent to your computer"), { timeout: 60000 });
    await phone.screenshot({ path: path.join(out, "5-phone-sent.png") });
    ok(true, "phone recorded, uploaded and shows the sent screen");

    // back on the desktop
    await desk.bringToFront();
    await wait(5000);
    console.log("   desktop polls so far:", polls);
    await desk.waitForFunction(() => document.body.innerText.toLowerCase().includes("take from your phone"), { timeout: 20000 });
    await wait(800);
    await desk.screenshot({ path: path.join(out, "6-desktop-received.png"), fullPage: true });
    ok(true, "desktop picked up the phone take without a refresh");
    const hasEdit = await desk.evaluate(() => Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.includes("Edit this take")));
    ok(hasEdit, "desktop offers 'Edit this take'");

    // the rest of the app at phone size
    for (const [name, route] of [["ideas", "/ideas?uc=gtm"], ["library", "/library"], ["signals", "/signals"]] as const) {
      await phone.goto(`${base}/demo`, { waitUntil: "networkidle2" });
      await phone.goto(`${base}${route}`, { waitUntil: "networkidle2" });
      await wait(400);
      const fits = await phone.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
      ok(fits, `${name} fits a 390px phone without sideways scroll`);
      await phone.screenshot({ path: path.join(out, `7-phone-${name}.png`), fullPage: false });
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
