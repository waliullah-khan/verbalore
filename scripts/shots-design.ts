import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// Screenshots every main screen of the demo at desktop and phone width, and flags sideways scrolling.
// usage: tsx scripts/shots-design.ts <screenshot dir> <chrome path> [base url]
const [out, exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3000";

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(`${base}/demo`, { waitUntil: "networkidle2" });
    const ideaHref = await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href^="/ideas/"]')?.getAttribute("href") ?? "/ideas");
    const screens: [string, string][] = [["ideas", "/ideas?uc=gtm"], ["idea", ideaHref], ["library", "/library"], ["signals", "/signals"], ["brain", "/brain"], ["settings", "/settings"]];
    const sizes: [string, number, number, boolean][] = [["wide", 1280, 900, false], ["phone", 390, 844, true]];
    for (const [sizeName, width, height, mobile] of sizes) {
      await page.setViewport({ width, height, isMobile: mobile });
      for (const [name, url] of screens) {
        await page.goto(`${base}${url}`, { waitUntil: "networkidle2" });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        console.log(`${overflow > 2 ? "SIDEWAYS" : "ok      "} ${sizeName.padEnd(5)} ${name}${overflow > 2 ? ` (+${overflow}px)` : ""}`);
        await page.screenshot({ path: path.join(out, `${sizeName}-${name}.png`), fullPage: true });
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
