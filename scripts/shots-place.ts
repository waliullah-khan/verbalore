import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type ElementHandle, type Page } from "puppeteer-core";

// Exercises the Austin place through the real UI: the watched list, permit signals, a video from a signal, and watching a builder.
const base = "http://localhost:3000";
const [out, exe] = process.argv.slice(2);
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

async function clickButton(page: Page, text: string, exact = false) {
  const h = await page.evaluateHandle((t, ex) => Array.from(document.querySelectorAll("button")).find((b) => (ex ? b.textContent?.trim() === t : b.textContent?.trim().startsWith(t))) ?? null, text, exact);
  const el = h.asElement() as ElementHandle<Element> | null;
  if (!el) throw new Error(`no button "${text}"`);
  await el.click();
}

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 1500 });
    await page.goto(`${base}/demo`, { waitUntil: "networkidle2" });
    await page.goto(`${base}/signals?src=primary`, { waitUntil: "networkidle2" });

    const text = await page.evaluate(() => document.body.innerText);
    ok(text.includes("Austin, TX") && text.includes("city permit records"), "Austin is on the watched list as a place read from city records");
    ok(text.includes("City permits"), "permit signals carry the 'City permits' source chip");
    ok(/new-home permits in 30 days/.test(text), "the market trend signal is shown");
    ok(/\d+-unit project permitted at/.test(text), "a large project signal is shown");
    ok(!text.includes("[object Object]"), "no broken permit links");
    await page.screenshot({ path: path.join(out, "place-signals.png"), clip: { x: 0, y: 700, width: 1100, height: 1500 } });

    const hasWatchBuilder = await page.evaluate(() => Array.from(document.querySelectorAll("button")).some((b) => b.textContent?.startsWith("Watch ") && !b.textContent.includes("Watch and scan") && b.textContent.length > 8));
    ok(hasWatchBuilder, "a builder found in a permit can be watched");

    // a signal becomes a video script
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 120000 }), clickButton(page, "Make a video from this")]);
    ok(/\/ideas\/[0-9a-f-]{36}/.test(page.url()), `lands on the new idea (${page.url().replace(/[0-9a-f-]{36}/, "<id>")})`);
    const idea = await page.evaluate(() => ({ h1: document.querySelector("h1")?.textContent ?? "", body: document.body.innerText }));
    ok(/permit|city/i.test(idea.body), "the script cites the city's permit records");
    ok(idea.body.includes("Record this"), "the idea can be recorded straight away");
    console.log("   idea:", idea.h1.slice(0, 90));
    await page.screenshot({ path: path.join(out, "place-idea.png"), fullPage: false });

    // watching a builder from a permit
    await page.goto(`${base}/signals?src=primary`, { waitUntil: "networkidle2" });
    const builder = await page.evaluate(() => Array.from(document.querySelectorAll("button")).map((b) => b.textContent ?? "").find((t) => t.startsWith("Watch ") && !t.includes("and scan") && t.length > 8) ?? "");
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }), clickButton(page, builder, true)]);
    const banner = await page.evaluate(() => document.body.innerText.match(/(Now watching|Already on your list)[^.]*\./)?.[0] ?? "");
    ok(banner.length > 0, `watching the builder "${builder.replace("Watch ", "")}": ${banner}`);
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
