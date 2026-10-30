"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import gsap from "gsap";
import Sticker from "./Sticker";
import type { Screen, StudioState } from "@/lib/studio-state";
import "./shell.css";

export type Game = "off" | "light" | "full";

type Ctx = {
  state: StudioState;
  game: Game;
  setGame: (g: Game) => void;
  go: (name: string) => void;
  screen: string;
};

const StudioContext = createContext<Ctx | null>(null);
export const useStudio = () => {
  const c = useContext(StudioContext);
  if (!c) throw new Error("useStudio needs the Shell");
  return c;
};

// The titles, place names and steps are the design's own words.
const TITLES: Record<string, [string, string]> = {
  home: ["Home", "Your studio at a glance. Open any part, or continue where you left off."],
  today: ["Today", "Five ideas ranked for you. Pick one to make."],
  record: ["Record", "Read from the script and record in one take."],
  edit: ["Edit", "Your video is cut and captioned. Change anything you like."],
  post: ["Post", "Choose where it goes and when."],
  library: ["Library", "Everything you have made and how it did."],
  signals: ["Signals", "People in your pipeline who just had news."],
  team: ["Team", "This week with your squad."],
};
const PLACE: Record<string, string> = {
  home: "The Studio Lot",
  today: "The Writers' Room",
  record: "The Soundstage",
  edit: "The Cutting Room",
  post: "The Marquee Theater",
  library: "The Archive",
  signals: "The Signal Tower",
  team: "The Prize Arcade",
};
const FLOW = ["today", "record", "edit", "post"];
const FLOWLAB = ["Choose an idea", "Record", "Edit", "Post"];
const GAMEHELP: Record<Game, string> = {
  off: "No scores, streaks or rankings anywhere.",
  light: "A streak and a weekly goal. Quiet celebrations.",
  full: "Idea cards, a weekly boss, a league and prizes.",
};
const SCALES = ["1", "1.15", "1.3"];

export function screenOf(p: string): string {
  if (p === "/" || p.startsWith("/home")) return "home";
  if (p.startsWith("/ideas")) return "today";
  if (p.startsWith("/studio")) return "record";
  if (/^\/library\/[^/]+\/edit/.test(p)) return "edit";
  if (/^\/library\/[^/]+\/post/.test(p)) return "post";
  if (p.startsWith("/library")) return "library";
  if (p.startsWith("/signals")) return "signals";
  if (p.startsWith("/team") || p.startsWith("/rewards")) return "team";
  return "other";
}

type Saved = { scale?: string; theme?: string; game?: string };
const load = (): Saved => {
  try { return JSON.parse(localStorage.getItem("vl-display") || "{}"); } catch { return {}; }
};
const save = (s: Saved) => {
  try { localStorage.setItem("vl-display", JSON.stringify(s)); } catch {}
};

type Props = {
  state: StudioState;
  wsName: string;
  isDemo: boolean;
  admin: boolean;
  pending: number;
  signOut: () => Promise<void>;
  children: React.ReactNode;
};

export default function Shell({ state: initial, wsName, isDemo, admin, pending, signOut, children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const screen = screenOf(pathname);

  const [state, setState] = useState(initial);
  const [game, setGameState] = useState<Game>("light");
  const [scale, setScale] = useState("1");
  const [theme, setTheme] = useState("auto");
  const [prev, setPrev] = useState("desktop");
  const [open, setOpen] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const lastScreen = useRef<string | null>(null);

  // the saved display choices
  useEffect(() => {
    const s = load();
    if (s.scale) setScale(s.scale);
    if (s.theme) setTheme(s.theme);
    if (s.game === "off" || s.game === "light" || s.game === "full") {
      setGameState(s.game);
      document.body.dataset.game = s.game;
    }
  }, []);

  const setGame = useCallback((g: Game) => {
    setGameState(g);
    document.body.dataset.game = g;
    save({ ...load(), game: g });
    window.dispatchEvent(new CustomEvent("vl-game", { detail: g }));
  }, []);

  // the Team page and the Today banner can change the game level too, so the menu and strip follow them
  useEffect(() => {
    const sync = () => {
      const g = load().game;
      if (g === "off" || g === "light" || g === "full") setGameState(g);
    };
    window.addEventListener("vl-game", sync);
    window.addEventListener("vl-display", sync);
    return () => { window.removeEventListener("vl-game", sync); window.removeEventListener("vl-display", sync); };
  }, []);

  // a layout is not re-rendered when only the page changes, so the numbers are fetched again after each move
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/studio-state", { cache: "no-store" });
      if (res.ok) setState(await res.json());
    } catch {}
  }, []);

  useEffect(() => {
    // opening an idea or its studio makes it the project in progress
    const m = pathname.match(/^\/(?:ideas|studio)\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (m) document.cookie = `vl-project=${m[1]}; path=/; max-age=2592000; samesite=lax`;
    if (lastScreen.current !== null || m) refresh();
  }, [pathname, refresh]);

  useEffect(() => {
    const t = setInterval(refresh, 30_000);
    window.addEventListener("vl-refresh", refresh);
    return () => { clearInterval(t); window.removeEventListener("vl-refresh", refresh); };
  }, [refresh]);

  const go = useCallback((name: string) => {
    const s = stateRef.current;
    const target = name === "make" ? (s.next === "done" ? "today" : s.next) : name;
    router.push(s.hrefs[target as Screen] ?? "/home");
  }, [router]);

  // the design's buttons say where they go with data-go; the game level can be set from anywhere with data-game-set
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const el = e.target as Element;
      const g = el.closest<HTMLElement>("[data-go]");
      if (g) { e.preventDefault(); go(g.dataset.go as string); return; }
      const gs = el.closest<HTMLElement>("[data-game-set]");
      if (gs) { setGame(gs.dataset.gameSet as Game); return; }
      if (el.closest("[data-open-phone]")) {
        e.preventDefault();
        const r = stateRef.current.hrefs.record;
        router.push(r === "/ideas" ? r : `${r}?phone=1`);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("click", onClick);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); };
  }, [go, router, setGame]);

  // each screen arrives the way the design's does: a circle opening from the building that was clicked, or a short fade
  useEffect(() => {
    const prevScreen = lastScreen.current;
    lastScreen.current = screen;
    const s = document.querySelector<HTMLElement>("#screens .screen");
    if (!s || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let pt: { x: number; y: number } | null = null;
    try { pt = JSON.parse(sessionStorage.getItem("vl-click") || "null"); sessionStorage.removeItem("vl-click"); } catch {}
    if (prevScreen === "home" && pt) {
      gsap.fromTo(s, { clipPath: `circle(0% at ${pt.x}% ${pt.y}%)` }, { clipPath: `circle(150% at ${pt.x}% ${pt.y}%)`, duration: 0.75, ease: "power2.inOut", clearProps: "clipPath" });
    } else {
      gsap.fromTo(s, { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, clearProps: "all" });
    }
  }, [pathname, screen]);

  const pickScale = (i: number) => {
    setScale(SCALES[i]);
    document.documentElement.style.setProperty("--scale", SCALES[i]);
    save({ ...load(), scale: SCALES[i] });
  };
  const pickTheme = (v: string) => {
    setTheme(v);
    if (v === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    save({ ...load(), theme: v });
  };
  const pickPrev = (v: string) => {
    setPrev(v);
    document.body.classList.toggle("phoneprev", v === "phone");
  };

  const inFlow = FLOW.includes(screen);
  const flowIdx = FLOW.indexOf(screen);
  const g = state.game;
  const titles = TITLES[screen];
  const navCur = (n: string) => (screen === n ? "page" : undefined);
  const tabOn = (n: string) => (FLOW.includes(screen) ? n === "make" : screen === n) ? "page" : undefined;
  const ctx = useMemo<Ctx>(() => ({ state, game, setGame, go, screen }), [state, game, setGame, go, screen]);

  return (
    <StudioContext.Provider value={ctx}>
      <div className="appc" id="frame">
        <div className="app" id="app">
          <aside className="side">
            <div className="brand">Verbalore</div>
            <div className="nav-groups">
              <div className="nav-group" role="group" aria-label="Home"><button className="nav-btn" data-go="home" aria-current={navCur("home")}><span>Home</span></button></div>
              <div className="nav-group" role="group" aria-label="Make a video" style={{ marginTop: ".75rem" }}>
                <div className="nav-label">Make a video</div>
                <button className="nav-btn" data-go="today" aria-current={navCur("today")}><span>Today</span><span className="n">1</span></button>
                <button className="nav-btn" data-go="record" aria-current={navCur("record")}><span>Record</span><span className="n">2</span></button>
                <button className="nav-btn" data-go="edit" aria-current={navCur("edit")}><span>Edit</span><span className="n">3</span></button>
                <button className="nav-btn" data-go="post" aria-current={navCur("post")}><span>Post</span><span className="n">4</span></button>
              </div>
              <div className="nav-group" role="group" aria-label="Your work" style={{ marginTop: ".75rem" }}>
                <div className="nav-label">Your work</div>
                <button className="nav-btn" data-go="library" aria-current={navCur("library")}><span>Library</span></button>
                <button className="nav-btn" data-go="signals" aria-current={navCur("signals")}><span>Signals</span><span className="n" id="sigCount">{state.signalsOpen}</span></button>
                <button className="nav-btn" data-go="team" aria-current={navCur("team")}><span>Team</span></button>
              </div>
            </div>
            <div className="card rep" id="repCard">
              {g.repDone ? (
                <><b>Today is done</b><p className="muted">Your video is posted. See you tomorrow.</p></>
              ) : (
                <><b>Today&apos;s video</b><p className="muted">Not posted yet. About ten minutes from idea to posted.</p><button className="btn primary sm" style={{ marginTop: ".7rem" }} data-go="today">Start</button></>
              )}
            </div>
            <div className="railfoot" title={`${wsName}${isDemo ? " · demo" : ""}`}>
              <Link href="/brain">Brain</Link>
              <Link href="/settings">Settings</Link>
              {admin && <Link href="/admin/access">Access requests{pending > 0 ? ` (${pending})` : ""}</Link>}
              <form action={signOut}><button>Sign out</button></form>
            </div>
          </aside>

          <div className="main">
            <header className="top">
              <div>
                <div className="brand mbrand">Verbalore</div>
                {titles && <h1 id="pgTitle">{titles[0]}</h1>}
                {titles && <p className="muted" id="pgSub">{titles[1]}</p>}
                {titles && <span className="pill acc g-on" id="placePill" style={{ marginTop: ".5rem" }} hidden={screen === "home"}>{screen === "home" ? "" : `You are in ${PLACE[screen]}`}</span>}
              </div>
              <div style={{ display: "flex", gap: ".6rem", alignItems: "flex-start", flexWrap: "wrap" }}>
                <button className="btn quiet" id="toLot" data-go="home" hidden={screen === "home"}>Back to the studio</button>
                <div className="dispwrap">
                  <button className="btn" id="dispBtn" aria-expanded={open} aria-controls="disp" onClick={() => setOpen(!open)}><span className="dl">Display and game</span><span className="ds">Display</span></button>
                  <div className="card disp" id="disp" hidden={!open}>
                    <div><div className="lab">Text size</div><div className="seg" id="scaleSeg">
                      {["Standard", "Large", "Extra large"].map((l, i) => <button key={l} data-v={i} aria-pressed={scale === SCALES[i]} onClick={() => pickScale(i)}>{l}</button>)}
                    </div></div>
                    <div><div className="lab">Appearance</div><div className="seg" id="themeSeg">
                      {[["auto", "Match device"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) => <button key={v} data-v={v} aria-pressed={theme === v} onClick={() => pickTheme(v)}>{l}</button>)}
                    </div></div>
                    <div><div className="lab">Preview this app on</div><div className="seg" id="prevSeg">
                      {[["desktop", "Computer"], ["phone", "Phone"]].map(([v, l]) => <button key={v} data-v={v} aria-pressed={prev === v} onClick={() => pickPrev(v)}>{l}</button>)}
                    </div></div>
                    <div><div className="lab">Game</div><div className="seg" id="gameSeg">
                      {([["off", "Off"], ["light", "A little"], ["full", "Full game"]] as [Game, string][]).map(([v, l]) => <button key={v} data-v={v} aria-pressed={game === v} onClick={() => setGame(v)}>{l}</button>)}
                    </div><p className="muted" style={{ fontSize: ".9rem", marginTop: ".4rem" }} id="gameHelp">{GAMEHELP[game]}</p></div>
                    <div className="acct"><div className="lab">Your account</div>
                      <div className="railfoot" style={{ padding: 0 }}>
                        <Link href="/brain" onClick={() => setOpen(false)}>Brain</Link>
                        <Link href="/settings" onClick={() => setOpen(false)}>Settings</Link>
                        {admin && <Link href="/admin/access" onClick={() => setOpen(false)}>Access requests{pending > 0 ? ` (${pending})` : ""}</Link>}
                        <form action={signOut}><button>Sign out</button></form>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </header>

            <div className="card gstrip g-on" id="gstrip">
              <Sticker name="streak" size="2.8" label="Streak flame" />
              <div className="gi"><span>Streak</span><b>{g.streak} {g.streak === 1 ? "day" : "days"}</b></div>
              <div className="gi"><span>This week</span><b>{g.week} of {g.weekGoal} videos</b></div>
              <div className="gi"><span>Team challenge</span><b>{g.teamPct}% done</b></div>
              {game === "full" && (
                <>
                  <div className="gi"><span>Level</span><b>{g.levelN}</b></div>
                  <div className="gi"><span>Experience</span><b className="mono">{Math.round(g.xp).toLocaleString("en-US")} / {g.levelHi.toLocaleString("en-US")}</b></div>
                  <div className="gi"><span>Tickets</span><b className="mono">{g.tickets}</b></div>
                </>
              )}
            </div>

            <ol className="stepper" id="stepper" aria-label="Steps to make a video" hidden={!inFlow}>
              {inFlow && FLOW.map((f, k) => (
                <li key={f}>
                  <button data-go={f} aria-label={`Step ${k + 1}, ${FLOWLAB[k]}${k < flowIdx ? ", done" : ""}`} aria-current={k === flowIdx ? "step" : undefined} className={k < flowIdx ? "done" : ""}>
                    <span className="num">{k + 1}</span><span className="sl">{FLOWLAB[k]}</span>
                  </button>
                </li>
              ))}
            </ol>

            <main id="screens">{children}</main>
          </div>
        </div>

        <nav className="tabbar" id="tabbar" aria-label="Main">
          <button data-go="home" aria-current={tabOn("home")}>Home</button>
          <button data-go="make" aria-current={tabOn("make")}>Make</button>
          <button data-go="library" aria-current={tabOn("library")}>Library</button>
          <button data-go="signals" aria-current={tabOn("signals")}>Signals</button>
          <button data-go="team" aria-current={tabOn("team")}>Team</button>
        </nav>
      </div>
      <div className="toast" id="toast" role="status" aria-live="polite" />
    </StudioContext.Provider>
  );
}
