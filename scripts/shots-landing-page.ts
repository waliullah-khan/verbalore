import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// Full-page screenshots of the landing page at desktop and phone width, light and dark, plus overflow and console checks.
// usage: tsx scripts/shots-landing-page.ts <out dir> <chrome path> [base url]
const [out, exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3106";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  try {
    for (const theme of ["light", "dark"] as const) {
      for (const [size, w, h, mobile] of [["wide", 1280, 800, false], ["phone", 390, 844, true]] as const) {
        const page = await browser.newPage();
        const errors: string[] = [];
        page.on("pageerror", (e) => errors.push(String(e)));
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
        await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
        await page.setViewport({ width: w, height: h, isMobile: mobile, deviceScaleFactor: 1 });
        await page.goto(base, { waitUntil: "networkidle2", timeout: 90000 });
        const total = await page.evaluate(() => document.documentElement.scrollHeight);
        for (let y = 0; y < total; y += Math.round(h * 0.7)) {
          await page.evaluate((yy) => window.scrollTo(0, yy), y);
          await wait(350);
        }
        await wait(1200);
        await page.evaluate(() => window.scrollTo(0, 0));
        await wait(600);
        const info = await page.evaluate(() => ({
          overflow: document.documentElement.scrollWidth - window.innerWidth,
          height: document.documentElement.scrollHeight,
          hiddenRise: Array.from(document.querySelectorAll<HTMLElement>("[data-rise]")).filter((e) => Number(getComputedStyle(e).opacity) < 0.5).length,
          brokenImgs: Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc && getComputedStyle(i).display !== "none").length,
        }));
        const broken = await page.evaluate(() => Array.from(document.images).filter((i) => i.complete && i.naturalWidth === 0 && i.currentSrc && getComputedStyle(i).display !== "none").map((i) => i.currentSrc.replace(location.origin, "")).slice(0, 5));
        const wide = await page.evaluate(() => Array.from(document.querySelectorAll("*")).filter((e) => e.getBoundingClientRect().right > window.innerWidth + 2).map((e) => (e as HTMLElement).tagName + "." + String((e as HTMLElement).className).slice(0, 40)).slice(0, 6));
        console.log("   broken:", JSON.stringify(broken), "wider than page:", JSON.stringify(wide));
        console.log(`${theme} ${size}: overflow ${info.overflow}px, height ${info.height}px, still-hidden ${info.hiddenRise}, broken images ${info.brokenImgs}, console errors ${errors.length}`);
        for (const e of errors.slice(0, 3)) console.log("   ", e.slice(0, 160));
        await page.screenshot({ path: path.join(out, `landing-${size}-${theme}.png`), fullPage: true });
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
