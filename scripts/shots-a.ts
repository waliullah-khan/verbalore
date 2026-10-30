import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// Screenshots the real shell and Home next to the Studio Lot design, so the two can be compared by eye.
// usage: tsx scripts/shots-a.ts <screenshot dir> <chrome path> [base url]
const [out, exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3101";
const art = `file:///${path.resolve("reference/studio-lot.html").replace(/\\/g, "/").replace(/ /g, "%20")}`;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  try {
    const sizes: [string, number, number, boolean][] = [["wide", 1280, 900, false], ["phone", 390, 844, true]];
    for (const [name, width, height, mobile] of sizes) {
      const a = await browser.newPage();
      await a.setViewport({ width, height, isMobile: mobile });
      for (const screen of ["home", "today"]) {
        await a.goto(`${art}#${screen}`, { waitUntil: "networkidle2" });
        await wait(2500);
        await a.screenshot({ path: path.join(out, `art-${screen}-${name}.png`) });
      }
      await a.close();

      const r = await browser.newPage();
      const errors: string[] = [];
      r.on("pageerror", (e) => errors.push(String(e).slice(0, 160)));
      r.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 160)); });
      await r.setViewport({ width, height, isMobile: mobile });
      await r.goto(`${base}/demo`, { waitUntil: "networkidle2", timeout: 90000 });
      await wait(1500);
      console.log(`${name}: landed on ${new URL(r.url()).pathname}`);
      await r.goto(`${base}/home`, { waitUntil: "networkidle2", timeout: 90000 });
      await wait(3000);
      await r.screenshot({ path: path.join(out, `real-home-${name}.png`) });
      const overflow = await r.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      console.log(`${name}: sideways overflow ${overflow}px, console errors ${errors.length}`);
      errors.slice(0, 4).forEach((e) => console.log("  !", e));
      await r.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
