import puppeteer, { type Page } from "puppeteer-core";
import { serviceClient } from "../src/lib/supabase/service";
import { publishVideo } from "../worker/publish";
import { THEMES } from "../src/lib/usecases";

// Drives Library, Edit and Post in a real browser against the demo workspace, then removes what it made.
// usage: tsx scripts/e2e-d.ts <chrome path> [base url]
const [exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3104";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };
const text = (page: Page, sel: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.innerText ?? "", sel);
const click = (page: Page, sel: string) => page.evaluate((s) => document.querySelector<HTMLElement>(s)?.click(), sel);
const clickText = (page: Page, sel: string, label: string) =>
  page.evaluate((s, l) => (Array.from(document.querySelectorAll<HTMLElement>(s)).find((b) => b.textContent?.trim() === l) as HTMLElement | undefined)?.click(), sel, label);

async function main() {
  const db = await serviceClient();
  const { data: ws } = await db.from("vl_workspaces").select("id").eq("is_demo", true).single();
  const made = { pubs: [] as string[], notes: [] as string[] };
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/demo`, { waitUntil: "networkidle2", timeout: 120000 });

    // ---- Library
    await page.goto(`${base}/library`, { waitUntil: "networkidle2", timeout: 120000 });
    const rows = await page.$$eval("#libList .lrow", (r) => r.length);
    ok(rows >= 4, `the Library lists the real videos (${rows})`);
    const titles = await page.$$eval("#libList .lrow b", (b) => b.map((x) => x.textContent ?? ""));
    ok(["cab that arrived late", "meetings in half", "advertising lost", "Weight loss"].every((t) => titles.some((x) => x.includes(t))), "all four videos are there");
    await clickText(page, "#libFilter button", "Posted");
    await wait(200);
    ok((await text(page, "#libList")).includes("No videos match") || (await page.$$eval("#libList .lrow", (r) => r.length)) < rows, "the Posted filter narrows the list");
    await clickText(page, "#libFilter button", "All");
    await page.type("#libQ", "cab");
    await wait(200);
    ok((await page.$$eval("#libList .lrow", (r) => r.length)) === 1, "search narrows to one video");
    await page.evaluate(() => { const i = document.querySelector<HTMLInputElement>("#libQ")!; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(i, ""); i.dispatchEvent(new Event("input", { bubbles: true })); });
    await wait(200);
    await page.evaluate(() => (document.querySelectorAll<HTMLElement>("#libList .lrow")[1] as HTMLElement).click());
    await wait(200);
    const second = titles[1];
    ok((await text(page, "#libDetail h3")).trim() === second.trim(), "choosing a row fills the detail panel");
    const editHref = await page.evaluate(() => document.querySelector<HTMLAnchorElement>('#libDetail a[href*="/edit"]')?.getAttribute("href") ?? "");
    const id = editHref.split("/")[2];

    const phone = await browser.newPage();
    await phone.setViewport({ width: 390, height: 844, isMobile: true });
    await phone.goto(`${base}/demo`, { waitUntil: "networkidle2", timeout: 120000 });
    await phone.goto(`${base}/library`, { waitUntil: "networkidle2", timeout: 120000 });
    await phone.evaluate(() => (document.querySelector<HTMLElement>("#libList .lrow") as HTMLElement).click());
    await wait(600);
    ok(await phone.evaluate(() => !document.getElementById("libSheet")!.hidden), "on a phone, a row opens the bottom sheet");
    await click(phone, "#sheetClose");
    await wait(200);
    ok(await phone.evaluate(() => document.getElementById("libSheet")!.hidden), "the sheet closes");
    await phone.close();

    // ---- Edit
    await page.goto(`${base}/library/${id}/edit`, { waitUntil: "networkidle2", timeout: 120000 });
    await wait(1500);
    const total = await text(page, "#timeTxt");
    ok(/\/ 0:\d\d$/.test(total.trim()), `the real video's length shows (${total.trim()})`);
    await click(page, "#playBtn");
    await wait(1800);
    const playing = await page.evaluate(() => ({ btn: document.getElementById("playBtn")!.textContent, t: document.querySelector("video")!.currentTime }));
    ok(playing.btn === "Pause" && playing.t > 0.5, `Play plays the real video (${playing.t.toFixed(1)}s)`);
    await click(page, "#playBtn");
    await page.evaluate(() => { const s = document.querySelector<HTMLInputElement>("#scrub")!; const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!; set.call(s, "9"); s.dispatchEvent(new Event("input", { bubbles: true })); });
    await wait(300);
    ok((await text(page, "#timeTxt")).trim().startsWith("0:09"), "the slider seeks the video");
    await page.evaluate(() => (document.querySelectorAll<HTMLElement>("#tlIn .tl-row")[1].querySelectorAll<HTMLElement>(".blk")[1]).click());
    await wait(300);
    ok((await text(page, "#inspector h3")).includes("Scene 2"), "a timeline block selects its scene");
    const before = await page.$eval("#fHead", (i) => (i as HTMLInputElement).value);
    await page.focus("#fHead");
    await page.evaluate(() => (document.querySelector<HTMLInputElement>("#fHead"))!.select());
    await page.keyboard.type("A changed headline");
    await page.evaluate(() => (document.querySelector("#fHead") as HTMLElement).blur());
    await wait(200);
    ok((await page.$eval("#fHead", (i) => (i as HTMLInputElement).value)) === "A changed headline", "the headline can be edited");
    await click(page, "#undo");
    await wait(200);
    ok((await page.$eval("#fHead", (i) => (i as HTMLInputElement).value)) === before, "Undo brings the old headline back");
    ok(await page.evaluate(() => (document.getElementById("durM") as HTMLButtonElement).disabled), "scene length is disabled, as the editor cannot change it");
    await clickText(page, "#editTabs button", "Look");
    await wait(200);
    const looks = await page.$$eval("#themeScroll button[data-k]", (b) => b.length);
    ok(looks === Object.keys(THEMES).length, `Look lists every theme the renderer has (${looks})`);
    await clickText(page, "#editTabs button", "Layers");
    await wait(200);
    ok(await page.evaluate(() => Array.from(document.querySelectorAll<HTMLButtonElement>("#layerList .sw")).every((b) => b.disabled)), "layer switches are disabled with a reason");
    ok(await page.evaluate(() => (document.getElementById("apply") as HTMLButtonElement).disabled), "Apply is disabled for a video with no original recording");

    // ---- Post
    await page.goto(`${base}/library/${id}/post`, { waitUntil: "networkidle2", timeout: 120000 });
    await wait(600);
    ok((await text(page, "#pSummary")).includes("Posting to 3 platforms right away"), "the summary counts the three platforms that start on");
    await click(page, '[data-p="facebook"]');
    await wait(200);
    ok(!!(await page.$("#cap_facebook")), "turning Facebook on shows its caption");
    await page.evaluate(() => { const t = document.querySelector<HTMLTextAreaElement>("#cap_youtube")!; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!; set.call(t, "x".repeat(130)); t.dispatchEvent(new Event("input", { bubbles: true })); });
    await wait(200);
    ok(await page.evaluate(() => (document.getElementById("reviewPost") as HTMLButtonElement).disabled), "a title over the limit blocks posting");
    await clickText(page, "button", "Make it shorter");
    await page.evaluate(() => { const t = document.querySelector<HTMLTextAreaElement>("#cap_youtube")!; const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!; set.call(t, "A short title"); t.dispatchEvent(new Event("input", { bubbles: true })); });
    await wait(200);
    await click(page, "#reviewPost");
    await wait(300);
    ok(await page.evaluate(() => !document.getElementById("confirm")!.hidden), "Review opens the confirm window");
    await click(page, "#cNo");
    await wait(200);
    ok(await page.evaluate(() => document.getElementById("confirm")!.hidden), "Go back closes it");

    await click(page, "#reviewPost");
    await wait(300);
    await click(page, "#cYes");
    await wait(600);
    ok(await page.evaluate(() => !document.getElementById("progress")!.hidden), "posting opens the progress window");
    // the shared queue may belong to the Railway worker, so the test finishes the simulated post itself
    let pubId = "";
    for (let i = 0; i < 20 && !pubId; i++) {
      const { data } = await db.from("vl_publish_jobs").select("id").eq("workspace_id", ws!.id).eq("video_id", id).order("created_at", { ascending: false }).limit(1);
      pubId = data?.[0]?.id ?? "";
      if (!pubId) await wait(500);
    }
    ok(!!pubId, "a publish job was queued");
    if (pubId) {
      made.pubs.push(pubId);
      const { data: row } = await db.from("vl_publish_jobs").select("platforms,captions").eq("id", pubId).single();
      ok(row?.platforms.length === 4 && (row.captions as { by: Record<string, string> }).by.youtube === "A short title", "it carries the four platforms and each platform's own caption");
      await publishVideo(db, pubId);
    }
    let done = "";
    for (let i = 0; i < 20 && !done; i++) {
      await wait(1000);
      done = await text(page, "#doneH");
    }
    ok(done.trim() === "Posted", `the done screen says ${JSON.stringify(done.trim())}`);
    ok((await text(page, "#postDone")).includes("nothing was really posted"), "and is honest that the demo only simulates posting");
    await page.screenshot({ path: process.env.SHOT_DONE ?? "done.png", fullPage: true });

    // ---- Send to one person
    await page.goto(`${base}/library/${id}/post`, { waitUntil: "networkidle2", timeout: 120000 });
    await clickText(page, "#postTabs button", "Send to one person");
    await wait(300);
    const hasContacts = !!(await page.$("#ctSel"));
    ok(hasContacts, "the note tab lists real contacts");
    if (hasContacts) {
      await click(page, "#copyLink");
      await wait(2500);
      const link = await text(page, ".sealed");
      ok(/\/v\/[a-f0-9]+/.test(link), `Copy link makes a private link (${link.trim().slice(0, 60)})`);
      const { data: notes } = await db.from("vl_video_notes").select("id").eq("workspace_id", ws!.id).eq("video_id", id);
      (notes ?? []).forEach((n) => made.notes.push(n.id as string));
      await click(page, "#reviewPost");
      await wait(300);
      await click(page, "#cYes");
      await wait(2500);
      ok(!(await page.evaluate(() => document.getElementById("progress")!.hidden)) === false, "sending to a demo contact is refused politely");
    }
  } finally {
    await browser.close();
    for (const p of made.pubs) {
      await db.from("vl_jobs").delete().eq("workspace_id", ws!.id).eq("kind", "publish_video").filter("payload->>publishId", "eq", p);
      await db.from("vl_publish_jobs").delete().eq("id", p);
    }
    for (const n of made.notes) await db.from("vl_video_notes").delete().eq("id", n);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
