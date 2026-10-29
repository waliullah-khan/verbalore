import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// Adds organizations through the real Signals page, waits for the worker's scan, and checks what shows up.
const base = "http://localhost:3000";
const [out, exe, ...orgs] = process.argv.slice(2);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1100, height: 1400 });
    await page.goto(`${base}/demo`, { waitUntil: "networkidle2" });
    await page.goto(`${base}/signals`, { waitUntil: "networkidle2" });

    await page.type('textarea[name="orgs"]', orgs.join("\n"));
    await Promise.all([
      page.waitForNavigation({ waitUntil: "networkidle2", timeout: 90000 }),
      page.evaluate(() => (Array.from(document.querySelectorAll("button")).find((b) => b.textContent?.includes("Watch and scan")) as HTMLButtonElement).click()),
    ]);
    const banner = await page.evaluate(() => document.body.innerText.match(/Now watching[^.]*\./)?.[0] ?? "");
    ok(/Now watching \d+ new organization/.test(banner), `banner confirms the add: "${banner}"`);
    await page.screenshot({ path: path.join(out, "a-added.png"), fullPage: true });

    const listed = await page.evaluate((names) => names.map((n) => document.body.innerText.includes(n)), orgs.map((o) => o.split(",")[0].trim()));
    ok(listed.every(Boolean), "every added organization is on the watched list");

    // wait for the worker: the "Scan all" button comes back when no scan is running, and the new orgs read "scanned just now"
    const t0 = Date.now();
    for (;;) {
      await wait(6000);
      await page.reload({ waitUntil: "networkidle2" });
      const state = await page.evaluate(() => ({ busy: document.body.innerText.includes("Scanning…"), text: document.body.innerText }));
      if (!state.busy || Date.now() - t0 > 420_000) break;
    }
    await page.screenshot({ path: path.join(out, "b-scanned.png"), fullPage: true });
    const text = await page.evaluate(() => document.body.innerText);
    for (const o of orgs) {
      const name = o.split(",")[0].trim();
      const line = text.split("\n").find((l) => l.includes(name) && l.includes("·")) ?? "";
      console.log(`   ${name}: ${line.slice(0, 90)}`);
    }
    const chips = await page.evaluate(() => Array.from(document.querySelectorAll("article")).map((a) => (a.innerText.match(/(SEC filing|Job board|Site change|GitHub|News)/) ?? [])[0]).filter(Boolean));
    const bySource = chips.reduce<Record<string, number>>((m, c) => ((m[c as string] = (m[c as string] ?? 0) + 1), m), {});
    console.log("   signals by source on the page:", JSON.stringify(bySource));
    ok(Object.keys(bySource).some((k) => k !== "News"), "at least one signal was found at a primary source");
    const foundAtSource = await page.evaluate(() => document.body.innerText.includes("found at the source"));
    ok(foundAtSource, "primary-source signals carry the 'found at the source' label");
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
