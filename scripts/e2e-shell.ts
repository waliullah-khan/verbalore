import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer from "puppeteer-core";

// Drives the shell and Home in a real browser: buildings, steps, Display panel, game levels, tab bar, current project.
// usage: tsx scripts/e2e-shell.ts <screenshot dir> <chrome path> [base url]
const [out, exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "http://localhost:3101";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) process.exitCode = 1; };

async function main() {
  mkdirSync(out, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  try {
    const page = await browser.newPage();
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e).slice(0, 140)));
    await page.setViewport({ width: 1280, height: 900 });
    await page.goto(`${base}/demo`, { waitUntil: "networkidle2", timeout: 90000 });
    ok(new URL(page.url()).pathname === "/home", "the demo link lands on Home");

    // header and game strip on Home
    const home = await page.evaluate(() => ({
      title: document.querySelector("#pgTitle")?.textContent,
      toLotHidden: (document.querySelector("#toLot") as HTMLElement).offsetParent === null,
      pillHidden: (document.querySelector("#placePill") as HTMLElement).offsetParent === null,
      stepperHidden: (document.querySelector("#stepper") as HTMLElement).offsetParent === null,
      current: document.querySelector('.nav-btn[aria-current="page"]')?.getAttribute("data-go"),
      strip: (document.querySelector("#gstrip") as HTMLElement).innerText.replace(/\s+/g, " "),
    }));
    ok(home.title === "Home" && home.toLotHidden && home.pillHidden && home.stepperHidden && home.current === "home", "Home: title, no back button, no place pill, no steps, rail marks Home");
    ok(/STREAK/i.test(home.strip) && /THIS WEEK/i.test(home.strip) && /TEAM CHALLENGE/i.test(home.strip) && !/EXPERIENCE/i.test(home.strip), `game strip shows the light level: "${home.strip}"`);

    // Display and game
    await page.click("#dispBtn");
    await page.click('#gameSeg button[data-v="full"]');
    await wait(300);
    const full = await page.evaluate(() => (document.querySelector("#gstrip") as HTMLElement).innerText.replace(/\s+/g, " "));
    ok(/LEVEL/i.test(full) && /EXPERIENCE/i.test(full) && /TICKETS/i.test(full), `Full game adds level, experience and tickets: "${full}"`);
    await page.screenshot({ path: path.join(out, "e-display-open.png") });
    await page.click('#gameSeg button[data-v="off"]');
    await wait(300);
    ok(await page.evaluate(() => (document.querySelector("#gstrip") as HTMLElement).offsetParent === null), "Game off hides the strip");
    await page.click('#gameSeg button[data-v="full"]');
    await page.click("#themeSeg button[data-v='dark']");
    await wait(400);
    await page.screenshot({ path: path.join(out, "e-home-dark.png") });
    ok(await page.evaluate(() => document.documentElement.getAttribute("data-theme") === "dark"), "Appearance: Dark applies");
    await page.click("#themeSeg button[data-v='light']");
    await page.click("#dispBtn");

    // choices survive a reload
    await page.reload({ waitUntil: "networkidle2" });
    ok(await page.evaluate(() => document.body.dataset.game === "full" && document.documentElement.getAttribute("data-theme") === "light"), "game level and appearance are remembered after a reload");
    await page.click('#dispBtn');
    await page.click('#gameSeg button[data-v="light"]');
    await page.click('#dispBtn');

    // the simple list
    await page.click('#viewSeg button[data-v="list"]');
    ok(await page.evaluate(() => (document.querySelector("#homeList") as HTMLElement).offsetParent !== null && (document.querySelector("#homeMap") as HTMLElement).offsetParent === null && document.querySelectorAll("#homeList .hrow").length === 7), "Simple list shows seven places");
    await page.screenshot({ path: path.join(out, "e-home-list.png") });
    await page.click('#viewSeg button[data-v="map"]');

    // click the Today building
    await page.click('.spot[data-spot="today"]');
    await page.waitForFunction(() => location.pathname === "/ideas", { timeout: 30000 });
    await wait(1200);
    const today = await page.evaluate(() => ({
      title: document.querySelector("#pgTitle")?.textContent,
      pill: (document.querySelector("#placePill") as HTMLElement).innerText,
      steps: Array.from(document.querySelectorAll("#stepper button")).map((b) => (b.querySelector(".sl") as HTMLElement).innerText),
      cur: document.querySelector("#stepper [aria-current=step]")?.getAttribute("data-go"),
      back: (document.querySelector("#toLot") as HTMLElement).offsetParent !== null,
    }));
    ok(today.title === "Today" && today.pill === "You are in The Writers' Room" && today.back, "clicking the Today building opens Today with its title, place pill and back button");
    ok(today.steps.join("|") === "Choose an idea|Record|Edit|Post" && today.cur === "today", "the four steps appear, on step one");
    await page.screenshot({ path: path.join(out, "e-today.png") });

    // opening an idea makes it the project in progress
    const href = await page.evaluate(() => document.querySelector<HTMLAnchorElement>('a[href^="/ideas/"]')?.getAttribute("href") ?? "");
    if (href) {
      await page.goto(`${base}${href}`, { waitUntil: "networkidle2" });
      await wait(1500);
      const cookie = (await page.cookies()).find((c) => c.name === "vl-project");
      ok(!!cookie && href.endsWith(cookie.value), "opening an idea remembers it as the current project");
      await page.click('.nav-btn[data-go="record"]');
      await page.waitForFunction(() => location.pathname.startsWith("/studio/"), { timeout: 30000 });
      ok(page.url().includes(cookie!.value), "Record in the rail goes to that idea's studio");
      await page.click('.nav-btn[data-go="home"]');
      await page.waitForFunction(() => location.pathname === "/home", { timeout: 30000 });
      await wait(1500);
      const next = await page.evaluate(() => document.querySelector("#nextCard h2")?.textContent);
      ok(next === "Record your video", `Home's next step now reads "${next}"`);
    }

    // phone: the tab bar
    await page.setViewport({ width: 390, height: 844, isMobile: true });
    await page.goto(`${base}/home`, { waitUntil: "networkidle2" });
    await wait(800);
    ok(await page.evaluate(() => getComputedStyle(document.querySelector(".side")!).display === "none" && getComputedStyle(document.querySelector("#tabbar")!).display !== "none"), "on a phone the rail gives way to the tab bar");
    await page.click('#tabbar button[data-go="library"]');
    await page.waitForFunction(() => location.pathname === "/library", { timeout: 30000 });
    ok(await page.evaluate(() => document.querySelector('#tabbar [aria-current="page"]')?.textContent === "Library"), "the tab bar marks the current tab");
    await page.click("#dispBtn");
    ok(await page.evaluate(() => Array.from(document.querySelectorAll(".acct a")).map((a) => a.textContent).join(",").includes("Settings") && getComputedStyle(document.querySelector(".acct")!).display !== "none"), "on a phone Brain, Settings and Sign out are in the Display panel");
    await page.screenshot({ path: path.join(out, "e-phone-display.png") });

    ok(errors.length === 0, `no script errors (${errors.length})${errors[0] ? `: ${errors[0]}` : ""}`);
  } finally {
    await browser.close();
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
