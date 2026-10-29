import { spawn, execSync, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { serviceClient } from "../src/lib/supabase/service";
import { enqueue } from "../src/lib/jobs";

// Signs up through the real pages, builds the brand brain with the real worker, checks the 5-video allowance,
// then looks at the account as an admin would, and removes everything it made.
// usage: tsx scripts/e2e-signup.ts <screenshot dir> <chrome path> [base url] [company website] [company linkedin]
const [out, exe, baseArg, siteArg, liArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3107";
const SITE = siteArg ?? "vercel.com";
const COMPANY_LI = liArg ?? "https://www.linkedin.com/company/vercel";
const email = `e2e-signup-${Date.now()}@example.com`;
const password = "correct-horse-battery";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failed++; };
type JobRow = { status: string; result: Record<string, unknown> | null; error: string | null };
const text = (page: Page) => page.evaluate(() => document.body.innerText);

let worker: ChildProcess | null = null;
// started as plain node so the path works on Windows, and so the whole process tree can be stopped
const startWorker = () => { worker = spawn(process.execPath, ["node_modules/tsx/dist/cli.mjs", "worker/index.ts"], { stdio: "ignore" }); };
const stopWorker = () => { if (worker?.pid) { try { execSync(`taskkill /PID ${worker.pid} /T /F`, { stdio: "ignore" }); } catch {} worker = null; } };

async function fill(page: Page, fields: Record<string, string>) {
  for (const [sel, value] of Object.entries(fields)) {
    await page.$eval(sel, (el) => { (el as HTMLInputElement).value = ""; });
    await page.type(sel, value);
  }
}

async function main() {
  mkdirSync(out, { recursive: true });
  const db = await serviceClient();
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  let userId = "";
  try {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: 1200, height: 1000 });

    // ---- sign up: bad input is explained, good input makes an account ----
    await page.goto(`${base}/login?mode=signup`, { waitUntil: "networkidle2" });
    await page.screenshot({ path: path.join(out, "1-signup.png") });
    const submit = async () => { await page.$eval("form", (f) => { (f as HTMLFormElement).noValidate = true; }); await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), page.click("form button.btn-primary")]); };

    await fill(page, { "#name": "Test Onboard", "#email": email, "#linkedin": "https://evil.example.com/in/x", "#password": password });
    await submit();
    ok((await text(page)).includes("link to your LinkedIn profile"), "a link that is not LinkedIn is turned back with a clear message");
    await fill(page, { "#name": "Test Onboard", "#email": email, "#linkedin": COMPANY_LI, "#password": "short" });
    await submit();
    ok((await text(page)).includes("at least 8 characters"), "a short password is explained");
    ok(!(await db.from("vl_profiles").select("user_id").eq("email", email).maybeSingle()).data, "nothing was created for the bad attempts");

    await fill(page, { "#name": "Test Onboard", "#email": email, "#linkedin": COMPANY_LI, "#password": password });
    await submit();
    ok(page.url().endsWith("/welcome"), "a good sign-up lands on the welcome page");
    const welcome = await text(page);
    ok(welcome.includes("Test Onboard") && welcome.includes(email) && welcome.includes("linkedin.com/company/vercel"), "the welcome page shows the name, email and LinkedIn that were given");
    await page.screenshot({ path: path.join(out, "2-welcome.png"), fullPage: true });

    const { data: prof } = await db.from("vl_profiles").select("user_id,workspace_id,linkedin_url").eq("email", email).single();
    userId = prof!.user_id;
    const { data: ws0 } = await db.from("vl_workspaces").select("name,is_demo").eq("id", prof!.workspace_id).single();
    ok(ws0?.name === "Test's workspace" && ws0.is_demo === false, "the workspace is named after the first name and is not the demo");

    // ---- log out, log back in ----
    await page.deleteCookie(...(await page.cookies()));
    await page.goto(`${base}/login`, { waitUntil: "networkidle2" });
    await fill(page, { "#email": email, "#password": "not-the-password" });
    await submit();
    ok((await text(page)).includes("do not match"), "a wrong password is refused");
    await fill(page, { "#email": email, "#password": password });
    await submit();
    ok(page.url().endsWith("/welcome"), "logging in again works and goes back to the welcome page until the brain is built");

    // ---- onboarding with the real worker ----
    startWorker();
    await page.type("#website", SITE);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), page.click("form button.btn-primary")]);
    ok((await text(page)).includes("Reading your website"), "submitting shows live progress with the first step");
    await page.screenshot({ path: path.join(out, "3-progress.png"), fullPage: true });

    const t0 = Date.now();
    let job = null as JobRow | null;
    const seen = new Set<string>();
    for (;;) {
      await wait(4000);
      const { data } = await db.from("vl_jobs").select("status,result,error").eq("workspace_id", prof!.workspace_id).eq("kind", "onboard_workspace").order("created_at", { ascending: false }).limit(1).single();
      job = data as JobRow;
      const step = (job?.result as { step?: string } | null)?.step;
      if (step && !seen.has(step)) { seen.add(step); console.log(`      step: ${step} (${Math.round((Date.now() - t0) / 1000)}s)`); }
      if (job?.status === "done" || job?.status === "failed" || Date.now() - t0 > 420_000) break;
    }
    ok(job?.status === "done", `the onboarding job finished (${Math.round((Date.now() - t0) / 1000)}s)${job?.error ? `: ${job.error}` : ""}`);
    ok(["website", "linkedin", "brain"].every((s) => seen.has(s)), "every step was reported while it ran");
    const r = (job?.result ?? {}) as Record<string, unknown>;

    const { data: ws1 } = await db.from("vl_workspaces").select("name,niche,offer,icp").eq("id", prof!.workspace_id).single();
    const { data: docs } = await db.from("vl_brain_docs").select("title,kind,use_case,content").eq("workspace_id", prof!.workspace_id).order("created_at");
    const { data: watches } = await db.from("vl_signal_watches").select("phrase").eq("workspace_id", prof!.workspace_id);
    ok((docs ?? []).length === 5 && (docs ?? []).every((d) => d.kind === "brand" && d.content.startsWith("Source:")), "five brain documents were written, each saying where it came from");
    ok(!!ws1?.niche && !!ws1.offer && !!ws1.icp, "the workspace got a niche, an offer and an audience");
    ok(ws1?.name !== "Test's workspace", `the workspace took the company's name (${ws1?.name})`);
    ok((watches ?? []).length >= 6, `signal phrases to watch were added (${(watches ?? []).length})`);
    console.log("\n--- WHAT THE JOB PRODUCED ---");
    console.log("company :", ws1?.name);
    console.log("useCase :", r.useCase, `(${r.useCaseLabel})`);
    console.log("niche   :", ws1?.niche);
    console.log("source  :", r.source);
    console.log("offer   :", ws1?.offer);
    console.log("icp     :", ws1?.icp);
    console.log("watches :", (watches ?? []).map((w) => w.phrase).join(" | "));
    for (const d of docs ?? []) console.log(`doc     : ${d.title} [use_case=${d.use_case}] ${d.content.slice(0, 140).replace(/\n/g, " ")}…`);
    console.log("-----------------------------\n");

    // the page waits for the first ideas, then moves on to Home
    await page.goto(`${base}/welcome`, { waitUntil: "networkidle2" });
    for (let i = 0; i < 60 && !page.url().includes("/home"); i++) { await wait(5000); await page.goto(`${base}/welcome`, { waitUntil: "networkidle2" }); }
    { const { data: ij } = await db.from("vl_jobs").select("status,error,result").eq("workspace_id", prof!.workspace_id).eq("kind", "generate_ideas").order("created_at", { ascending: false }).limit(1).maybeSingle(); console.log("      idea job:", ij ? `${ij.status} ${ij.error ?? ""} ${JSON.stringify(ij.result ?? {}).slice(0, 200)}` : "none"); }
    ok(page.url().includes("/home"), "when the ideas are written the welcome page moves on to Home");
    const { count: ideaCount } = await db.from("vl_ideas").select("id", { count: "exact", head: true }).eq("workspace_id", prof!.workspace_id);
    ok((ideaCount ?? 0) >= 3, `the first ideas exist (${ideaCount})`);
    await page.screenshot({ path: path.join(out, "4-home.png") });
    stopWorker();

    // ---- second run: no website, LinkedIn only (the company page is allowed to name the website) ----
    if (!process.env.QUICK) {
    await db.from("vl_profiles").update({ onboarded_at: null }).eq("user_id", userId);
    startWorker();
    const id2 = await enqueue(db, prof!.workspace_id, "onboard_workspace", { website: null, linkedin: COMPANY_LI });
    const t1 = Date.now();
    let job2 = null as JobRow | null;
    for (;;) {
      await wait(4000);
      const { data } = await db.from("vl_jobs").select("status,result,error").eq("id", id2).single();
      job2 = data as JobRow;
      if (job2?.status === "done" || job2?.status === "failed" || Date.now() - t1 > 420_000) break;
    }
    stopWorker();
    ok(job2?.status === "done", `a run with no website finished (${Math.round((Date.now() - t1) / 1000)}s)${job2?.error ? `: ${job2.error}` : ""}`);
    console.log("no-website source:", (job2?.result as { source?: string } | null)?.source, "| website:", (job2?.result as { website?: string } | null)?.website);
    const { data: docs2 } = await db.from("vl_brain_docs").select("id").eq("workspace_id", prof!.workspace_id).eq("kind", "brand");
    ok((docs2 ?? []).length === 5, "re-running replaced the brain documents instead of piling up copies");
    }

    // ---- the 5-video allowance (no worker running, so queued edits stay queued) ----
    const wsId = prof!.workspace_id as string;
    const { data: idea } = await db.from("vl_ideas").insert({ workspace_id: wsId, angle: "e2e", hook: "e2e", why_now: "", score: 0, status: "note", use_case: "general", evidence: [], script: { title: "e2e", beats: [] } }).select("id").single();
    for (let i = 0; i < 3; i++) await db.from("vl_videos").insert({ workspace_id: wsId, idea_id: idea!.id, title: `e2e ${i}`, status: "ready", template: "editorial", output_path: `${wsId}/e2e-${i}.mp4`, duration_s: 20, use_case: "general" });
    await db.from("vl_videos").insert({ workspace_id: wsId, idea_id: idea!.id, title: "e2e failed", status: "failed", template: "editorial", duration_s: 0, use_case: "general" });
    for (let i = 0; i < 2; i++) await db.from("vl_recordings").insert({ workspace_id: wsId, idea_id: idea!.id, path: `${wsId}/${idea!.id}/e2e-${i}.mp4`, duration_s: 12 });

    await page.goto(`${base}/library`, { waitUntil: "networkidle2" });
    ok((await text(page)).includes("3 of 5 videos used"), "the Library shows 3 of 5 videos used, and a failed edit does not use a slot");
    await page.screenshot({ path: path.join(out, "5-library-3of5.png"), fullPage: true });

    const clickEdit = async () => {
      await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 }).catch(() => undefined);
      await wait(2500);
      const found = await page.evaluate(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent === "Edit this video") as HTMLButtonElement | undefined; b?.click(); return !!b; });
      console.log("      edit button found:", found);
      await wait(6000);
    };
    // 4th and 5th are allowed
    await clickEdit();
    await page.goto(`${base}/library`, { waitUntil: "networkidle2" });
    ok((await text(page)).includes("4 of 5 videos used"), "the fourth video is allowed");
    await clickEdit();
    await page.goto(`${base}/library`, { waitUntil: "networkidle2" });
    ok((await text(page)).includes("5 of 5 videos used"), "the fifth video is allowed");
    // a sixth is refused, with a kind message
    await db.from("vl_recordings").insert({ workspace_id: wsId, idea_id: idea!.id, path: `${wsId}/${idea!.id}/e2e-extra.mp4`, duration_s: 12 });
    await page.goto(`${base}/library`, { waitUntil: "networkidle2" });
    await clickEdit();
    ok((await text(page)).includes("You have used your 5 videos"), "a sixth video is refused with a kind message");
    await page.screenshot({ path: path.join(out, "6-refused.png"), fullPage: true });
    const { count: n6 } = await db.from("vl_videos").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).or("status.neq.failed,output_path.not.is.null");
    ok(n6 === 5, `the refused edit made no video (${n6} counted)`);
    // a re-edit of an existing video is not a new video
    const { data: ready } = await db.from("vl_videos").select("id").eq("workspace_id", wsId).eq("status", "ready").limit(1).single();
    await db.from("vl_videos").update({ status: "queued", template: "kinetic" }).eq("id", ready!.id);
    const { count: n7 } = await db.from("vl_videos").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).or("status.neq.failed,output_path.not.is.null");
    ok(n7 === 5, "re-editing an existing video does not use another slot");

    // the worker refuses a first-time render over the limit too
    const { data: sixth } = await db.from("vl_videos").insert({ workspace_id: wsId, idea_id: idea!.id, title: "e2e sixth", status: "queued", template: "editorial", use_case: "general" }).select("id").single();
    await enqueue(db, wsId, "render_video", { videoId: sixth!.id });
    startWorker();
    let sv = null as { status: string; error: string | null } | null;
    for (let i = 0; i < 20; i++) { await wait(3000); const { data } = await db.from("vl_videos").select("status,error").eq("id", sixth!.id).single(); sv = data; if (sv?.status === "failed") break; }
    stopWorker();
    ok(sv?.status === "failed" && /used your 5 videos/.test(sv.error ?? ""), "the worker refuses a first-time render over the limit and says why on the video");

    // deleting one makes room again
    await db.from("vl_videos").delete().eq("id", sixth!.id);
    const { data: gone } = await db.from("vl_videos").select("id").eq("workspace_id", wsId).eq("title", "e2e 0").single();
    await db.from("vl_videos").delete().eq("id", gone!.id);
    await page.goto(`${base}/library`, { waitUntil: "networkidle2" });
    ok((await text(page)).includes("4 of 5 videos used"), "deleting a video frees its slot");

    // ---- the account as an admin sees it, and turning it off ----
    const { data: adminReq } = await db.from("vl_access_requests").select("invite_token").ilike("email", (process.env.ADMIN_EMAILS ?? "").split(",")[0].trim()).maybeSingle();
    if (adminReq?.invite_token) {
      const actx = await browser.createBrowserContext();
      const a = await actx.newPage();
      await a.setViewport({ width: 1200, height: 1000 });
      await a.goto(`${base}/access/${adminReq.invite_token}`, { waitUntil: "networkidle2" });
      await a.goto(`${base}/admin/access`, { waitUntil: "networkidle2" });
      const acc = await text(a);
      ok(acc.includes(email) && acc.includes("linkedin.com/company/vercel") && acc.includes("brand brain built"), "the admin Accounts page lists the account with its LinkedIn and brain status");
      await a.screenshot({ path: path.join(out, "7-admin-accounts.png"), fullPage: true });
      const turn = async (label: string) => {
        await a.evaluate((who, lab) => {
          const card = Array.from(document.querySelectorAll("li")).find((l) => l.innerText.includes(who))!;
          (Array.from(card.querySelectorAll("button")).find((b) => b.textContent === lab) as HTMLButtonElement).click();
        }, email, label);
        await wait(4000);
        await a.reload({ waitUntil: "networkidle2" });
      };
      await turn("Turn account off");
      const lctx = await browser.createBrowserContext();
      const l = await lctx.newPage();
      await l.goto(`${base}/login`, { waitUntil: "networkidle2" });
      await fill(l, { "#email": email, "#password": password });
      await Promise.all([l.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), l.click("form button.btn-primary")]);
      ok((await text(l)).includes("turned off"), "a turned-off account cannot log in");
      await turn("Turn account back on");
      await fill(l, { "#email": email, "#password": password });
      await Promise.all([l.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), l.click("form button.btn-primary")]);
      ok(!l.url().includes("/login"), "after turning it back on, the account can log in again");
    } else {
      console.log("SKIP  admin view (no admin access token in this database)");
    }
  } finally {
    stopWorker();
    await browser.close();
    // remove everything the test made
    const { data: p } = await db.from("vl_profiles").select("user_id,workspace_id").eq("email", email).maybeSingle();
    const uid = p?.user_id ?? userId;
    const wid = p?.workspace_id as string | undefined;
    if (wid) {
      const { data: recs } = await db.from("vl_recordings").select("path").eq("workspace_id", wid);
      if (recs?.length) await db.storage.from("vl-recordings").remove(recs.map((r) => r.path as string));
      await db.from("vl_publish_jobs").delete().eq("workspace_id", wid);
      for (const t of ["vl_jobs", "vl_signal_watches", "vl_brain_docs", "vl_videos", "vl_recordings", "vl_ideas", "vl_members"]) await db.from(t).delete().eq("workspace_id", wid);
      await db.from("vl_profiles").delete().eq("workspace_id", wid);
      await db.from("vl_workspaces").delete().eq("id", wid);
    }
    if (uid) await db.auth.admin.deleteUser(uid);
    const left = uid ? (await db.auth.admin.getUserById(uid)).data.user : null;
    console.log(left ? "CLEANUP FAILED: the test account is still there" : "cleanup: the test account and everything it made are gone");
  }
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL CHECKS PASSED");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); stopWorker(); process.exit(1); });
