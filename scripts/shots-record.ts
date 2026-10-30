import { mkdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import puppeteer, { type Page } from "puppeteer-core";
import { serviceClient } from "../src/lib/supabase/service";

// Compares the Record screen and phone modal with the artifact, and drives them with a fake camera.
// The phone's upload and status are stubbed in the browser, so nothing is uploaded and no edit is queued.
// usage: tsx scripts/shots-record.ts <screenshot dir> <chrome path> [base url]
const [out, exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3103";
const artifact = pathToFileURL(path.resolve("reference/studio-lot.html")).href;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };
const text = (page: Page, sel: string) => page.$eval(sel, (e) => (e as HTMLElement).innerText).catch(() => "");

async function main() {
  mkdirSync(out, { recursive: true });
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("id").eq("is_demo", true).single();
  const { data: idea } = await db.from("vl_ideas").select("id,hook").eq("workspace_id", ws!.id).not("status", "in", "(note,signal)").limit(1).single();

  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
  });
  try {
    for (const [name, w, h, mobile] of [["wide", 1280, 900, false], ["phone", 390, 844, true]] as const) {
      const a = await browser.newPage();
      await a.setViewport({ width: w, height: h, isMobile: mobile });
      await a.goto(`${artifact}#record`, { waitUntil: "networkidle2" });
      await wait(1500);
      await a.screenshot({ path: path.join(out, `${name}-artifact-record.png`), fullPage: true });
      await a.close();
    }

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/demo`, { waitUntil: "networkidle2" });
    await page.goto(`${base}/studio/${idea!.id}`, { waitUntil: "networkidle2" });
    await wait(1500);
    await page.screenshot({ path: path.join(out, "wide-real-record.png"), fullPage: true });

    // 1. the script on the prompter is the idea's real script
    const prompter = await text(page, "#pinner");
    ok(prompter.length > 40, `the prompter shows the idea's script (${prompter.length} characters)`);
    ok((await text(page, "#recIdea")).length > 5, "the 'Script for' card names the idea");
    ok((await page.$$eval("#meter i", (e) => e.length)) === 6, "the level meter has six bars");
    ok((await text(page, "#camState")) === "Ready", "the camera badge reads Ready");
    const camOn = await page.waitForFunction(() => (document.querySelector("video.live") as HTMLVideoElement | null)?.videoWidth, { timeout: 8000 }).then(() => true).catch(() => false);
    ok(camOn, "the real camera feed is playing inside the camera frame");

    // 2. a take: count in, record, stop, review
    await page.click("#recStart");
    await wait(1000);
    await page.screenshot({ path: path.join(out, "wide-real-countin.png") });
    ok(!(await page.$eval("#count", (e) => (e as HTMLElement).hidden)), "the count-in shows");
    await wait(3800);
    ok((await text(page, "#camState")) === "Recording", "the badge reads Recording");
    await wait(2200);
    const t1 = await text(page, "#camTime");
    ok(t1 !== "0:00", `the timer is running (${t1})`);
    const pos = await page.$eval("#pinner", (e) => getComputedStyle(e).transform);
    ok(pos !== "none", "the prompter is scrolling");
    await page.screenshot({ path: path.join(out, "wide-real-recording.png"), fullPage: true });
    await page.click("#recStop");
    await page.waitForFunction(() => !(document.getElementById("review") as HTMLElement).hidden, { timeout: 8000 });
    const checks = await page.$$eval("#review .checks li", (l) => l.map((x) => (x as HTMLElement).innerText));
    ok(/^Take 1 is ready/.test(await text(page, "#revTitle")), "the review says Take 1 is ready");
    ok(checks.length >= 2 && /Length is/.test(checks[checks.length - 1]), `the checks are real measurements: ${JSON.stringify(checks)}`);
    await page.screenshot({ path: path.join(out, "wide-real-review.png"), fullPage: true });
    await page.click("#retake");
    ok(await page.$eval("#review", (e) => (e as HTMLElement).hidden), "Record again hides the review");

    // 3. practice does not record anything
    await page.click("#practice");
    await wait(4600);
    ok((await text(page, "#camState")) === "Practice", "practice read-through runs");
    await page.click("#recStop");
    ok(await page.$eval("#review", (e) => (e as HTMLElement).hidden), "practice leaves no take behind");

    // 4. controls
    await page.click('#ptSeg button[data-v="1.3"]');
    ok((await page.$eval("#pview", (e) => (e as HTMLElement).style.getPropertyValue("--pt"))) === "1.3", "A+ enlarges the prompter text");
    await page.click("#mirror");
    ok(await page.$eval("#mirror", (e) => e.getAttribute("aria-pressed") === "true"), "Mirror text switches on");
    await page.click("#mirror");
    await page.$eval("#wpm", (e) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(e, "160");
      e.dispatchEvent(new Event("input", { bubbles: true }));
    });
    ok((await text(page, "#wpmV")) === "160", "the speed label follows the slider");
    await page.click("#editScript");
    ok(!!(await page.$("#scriptTa")), "Edit script opens a text box");
    await page.$eval("#scriptTa", (e) => { (e as HTMLTextAreaElement).value = "Only one line"; });
    await page.click("#editScript");
    await wait(400);
    ok(!!(await page.$("#scriptTa")), "one line is refused, the box stays open");
    await page.click("#editScript").catch(() => undefined);

    // 5. the phone modal, with the phone's status stubbed
    await page.setRequestInterception(true);
    const phase = { n: 0 };
    page.on("request", (req) => {
      if (/\/api\/capture\/[a-f0-9]+$/.test(req.url()) && req.method() === "GET") {
        phase.n++;
        const body = phase.n < 3 ? { status: "waiting" } : phase.n < 5 ? { status: "uploading" } : { status: "uploaded", path: "demo/x/phone-1.webm", previewUrl: "data:video/webm;base64,", durationS: 41 };
        return void req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
      }
      req.continue();
    });
    await page.click("#usePhone");
    await page.waitForSelector("#phoneModal .qrbox svg", { timeout: 15000 });
    ok(true, "Use my phone opens the modal with a real QR code");
    await wait(600);
    await page.screenshot({ path: path.join(out, "wide-real-phone-waiting.png") });
    ok((await page.$$eval("#pmSteps li", (l) => l.length)) === 4, "four progress steps");
    ok(await page.$eval("#pmUse", (e) => (e as HTMLButtonElement).disabled), "Use this video is disabled until a take arrives");
    await page.waitForFunction(() => document.querySelector('.ph[data-ph="4"]:not([hidden])'), { timeout: 12000 });
    await page.screenshot({ path: path.join(out, "wide-real-phone-uploading.png") });
    ok(true, "the phone preview shows the sending screen while the phone uploads");
    await page.waitForFunction(() => document.querySelector('.ph[data-ph="5"]:not([hidden])'), { timeout: 12000 });
    await page.screenshot({ path: path.join(out, "wide-real-phone-sent.png") });
    ok(!(await page.$eval("#pmUse", (e) => (e as HTMLButtonElement).disabled)), "Use this video and edit turns on when the take arrives");
    await page.click("#phRecentBtn2");
    ok(!!(await page.$('.ph[data-ph="6"]:not([hidden])')), "Recent on this phone opens the list");
    await page.screenshot({ path: path.join(out, "wide-real-phone-recent.png") });
    await page.setRequestInterception(false);
    await page.close();

    // the artifact's own modal, for comparison
    const a2 = await browser.newPage();
    await a2.setViewport({ width: 1280, height: 900 });
    await a2.goto(`${artifact}#record`, { waitUntil: "networkidle2" });
    await wait(1200);
    await a2.click("#usePhone");
    await wait(800);
    await a2.screenshot({ path: path.join(out, "wide-artifact-phone.png") });
    await a2.close();

    // 6. the phone's own page, full screen
    const { data: sess } = await db.from("vl_capture_sessions").select("token").eq("workspace_id", ws!.id).gt("expires_at", new Date().toISOString()).order("created_at", { ascending: false }).limit(1).single();
    if (sess) {
      const ph = await browser.newPage();
      await ph.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
      await ph.setRequestInterception(true);
      const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "PUT, POST, GET, OPTIONS" };
      ph.on("request", (req) => {
        const u = req.url();
        if (req.method() === "OPTIONS" && /\/storage\/v1\/object\/upload\/sign\//.test(u)) return void req.respond({ status: 204, headers: cors });
        if (req.method() === "POST" && /\/api\/capture\/[a-f0-9]+\/upload$/.test(u)) {
          const step = JSON.parse(req.postData() || "{}").step;
          return void req.respond({ status: 200, contentType: "application/json", body: JSON.stringify(step === "sign" ? { path: "demo/phone-test.webm", token: "stub" } : { ok: true }) });
        }
        if (req.method() === "PUT" && /\/storage\/v1\/object\/upload\/sign\//.test(u)) {
          return void setTimeout(() => req.respond({ status: 200, headers: cors, contentType: "application/json", body: JSON.stringify({ Key: "vl-recordings/demo/phone-test.webm" }) }), 900);
        }
        req.continue();
      });
      await ph.goto(`${base}/r/${sess.token}`, { waitUntil: "networkidle2" });
      await ph.screenshot({ path: path.join(out, "phone-real-0-allow.png") });
      ok((await text(ph, ".ph-card")).includes("Allow the camera and microphone"), "the phone starts on the allow screen");
      await ph.click("#phAllow");
      await ph.waitForSelector("#phRec", { timeout: 30000 });
      await wait(800);
      await ph.screenshot({ path: path.join(out, "phone-real-1-ready.png") });
      ok((await text(ph, "#phScrollIn")).length > 40, "the script is on the phone screen");
      await ph.click("#phRec");
      await wait(1100);
      await ph.screenshot({ path: path.join(out, "phone-real-2-count.png") });
      await wait(3600);
      ok((await text(ph, "#phState")) === "Recording", "the phone is recording");
      await ph.screenshot({ path: path.join(out, "phone-real-3-recording.png") });
      await ph.click("#phRec");
      await ph.waitForSelector("#phUse", { timeout: 30000 });
      await ph.screenshot({ path: path.join(out, "phone-real-4-keep.png") });
      ok(/\d:\d\d/.test(await text(ph, "#phLen")), `the keep screen reports the real length: "${await text(ph, "#phLen")}"`);
      await ph.click("#phUse");
      await wait(500);
      await ph.screenshot({ path: path.join(out, "phone-real-5-upload.png") });
      await ph.waitForSelector("#phMore", { timeout: 30000 });
      await ph.screenshot({ path: path.join(out, "phone-real-6-sent.png") });
      ok(true, "Use it sends the video and the phone says Sent");
      await ph.click("#phRecentBtn2");
      ok((await ph.$$eval(".phrow", (r) => r.length)) >= 1, "Recent on this phone lists the take just sent");
      await ph.screenshot({ path: path.join(out, "phone-real-7-recent.png") });
      await ph.close();
    } else {
      console.log("SKIP  no unexpired capture session for the phone page test");
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
