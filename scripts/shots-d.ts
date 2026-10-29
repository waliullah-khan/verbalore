import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// Library, Edit and Post as built, next to the same screens in the design file.
// usage: tsx scripts/shots-d.ts <screenshot dir> <chrome path> [base url]
const [out, exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3104";
const art = "file:///C:/Users/MR.Laptops/OneDrive%20-%20purdue.edu/Desktop/verbalore/reference/studio-lot.html";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sizes: [string, number, number, boolean][] = [["wide", 1280, 900, false], ["phone", 390, 844, true]];

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox", "--autoplay-policy=no-user-gesture-required"] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    await page.goto(`${base}/demo`, { waitUntil: "networkidle2", timeout: 120000 });
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/library`, { waitUntil: "networkidle2", timeout: 120000 });
    const href = await page.evaluate(() => document.querySelector<HTMLAnchorElement>('#libDetail a[href*="/edit"]')?.getAttribute("href") ?? "");
    const id = href.split("/")[2];
    console.log("video", id);

    for (const [name, w, h, mobile] of sizes) {
      await page.setViewport({ width: w, height: h, isMobile: mobile });
      for (const [screen, url] of [["library", "/library"], ["edit", `/library/${id}/edit`], ["post", `/library/${id}/post`]] as const) {
        await page.goto(`${base}${url}`, { waitUntil: "networkidle2", timeout: 120000 });
        await wait(800);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        console.log(`${over > 2 ? "SIDEWAYS" : "ok      "} ${name} ${screen}${over > 2 ? ` (+${over}px)` : ""}`);
        await page.screenshot({ path: path.join(out, `real-${name}-${screen}.png`), fullPage: true });

        const ref = await browser.newPage();
        await ref.setViewport({ width: w, height: h, isMobile: mobile });
        await ref.goto(`${art}#${screen}`, { waitUntil: "networkidle2", timeout: 60000 }).catch(() => undefined);
        await wait(1500);
        await ref.screenshot({ path: path.join(out, `art-${name}-${screen}.png`), fullPage: true });
        await ref.close();
      }
    }
    if (errors.length) console.log("console errors:\n" + [...new Set(errors)].slice(0, 8).join("\n"));
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
