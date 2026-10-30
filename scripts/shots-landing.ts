import { mkdirSync } from "node:fs";
import { readFileSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// Captures the real demo screens for the landing page: desktop and phone, light and dark.
// usage: tsx scripts/shots-landing.ts <out dir> <chrome path> [base url]
const [out, exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3106";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({
    executablePath: exe,
    headless: true,
    args: ["--no-sandbox", "--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", ...(process.env.FAKE_VIDEO ? [`--use-file-for-fake-video-capture=${process.env.FAKE_VIDEO}`] : [])],
  });
  try {
    for (const theme of ["light", "dark"] as const) {
      const page = await browser.newPage();
      await page.emulateMediaFeatures([{ name: "prefers-color-scheme", value: theme }]);
      await page.evaluateOnNewDocument((t) => {
        try { localStorage.setItem("vl-display", JSON.stringify({ theme: t, game: "full" })); } catch {}
      }, theme);
      await page.setViewport({ width: 1280, height: 800 });
      await page.goto(`${base}/demo`, { waitUntil: "networkidle2", timeout: 90000 });

      const ideaHref = await page.evaluate(() => {
        const a = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="/ideas/"]'))[0];
        return a?.getAttribute("href") ?? "";
      });
      await page.goto(`${base}/library`, { waitUntil: "networkidle2", timeout: 90000 });
      const videoId = await page.evaluate(() => {
        const m = document.documentElement.innerHTML.match(/\/library\/([0-9a-f-]{36})\/(?:edit|post)/);
        return m?.[1] ?? "";
      });
      await page.goto(`${base}/ideas?uc=gtm`, { waitUntil: "networkidle2", timeout: 90000 });
      const ideaId = await page.evaluate(() => {
        const m = document.documentElement.innerHTML.match(/\/(?:ideas|studio)\/([0-9a-f-]{36})/);
        return m?.[1] ?? "";
      });
      console.log(theme, "idea", ideaId || ideaHref, "video", videoId);

      const screens: [string, string][] = [
        ["home", "/home"],
        ["today", "/ideas?uc=gtm"],
        ["record", `/studio/${ideaId}`],
        ["edit", `/library/${videoId}/edit`],
        ["library", "/library"],
        ["signals", "/signals"],
        ["team", "/team"],
      ];
      for (const [size, w, h, mobile] of [["wide", 1280, 800, false], ["phone", 390, 844, true]] as const) {
        await page.setViewport({ width: w, height: h, isMobile: mobile, deviceScaleFactor: mobile ? 2 : 1 });
        for (const [name, url] of screens) {
          if (process.env.ONLY && !process.env.ONLY.split(",").includes(name)) continue;
          await page.goto(`${base}${url}`, { waitUntil: "networkidle2", timeout: 90000 });
          await wait(1800);
          // the live camera is a stand-in in headless Chrome, so the frame shows a still of the speaker instead
          if (name === "record" && process.env.FACE_IMG) {
            const src = `data:image/jpeg;base64,${readFileSync(process.env.FACE_IMG).toString("base64")}`;
            await page.evaluate((u) => {
              const c = document.querySelector<HTMLElement>(".cam");
              if (!c) return;
              c.querySelectorAll("video").forEach((v) => ((v as HTMLElement).style.display = "none"));
              c.style.background = `url(${u}) center / cover`;
            }, src);
            await wait(300);
          }
          await page.screenshot({ path: path.join(out, `${name}-${size}-${theme}.png`) });
          console.log("shot", name, size, theme);
        }
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
