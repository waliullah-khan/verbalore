"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { CustomEase } from "gsap/CustomEase";
import { CustomBounce } from "gsap/CustomBounce";
import Sticker from "./Sticker";

// The Team screen from the Studio Lot design: the weekly boss and its arena, the squad, the league, the prize box
// and the badges. Every number comes from the workspace's real videos. The only thing kept on this device is the
// prize ledger (boxes opened and rewards claimed), and the screen says so.

if (typeof window !== "undefined") {
  gsap.registerPlugin(CustomEase, CustomBounce);
  CustomBounce.create("pop", { strength: 0.5 });
}

export type TeamBadge = { id: string; name: string; how: string; unit: string; have: number; need: number; icon: string };
export type TeamData = {
  wsId: string;
  wsName: string;
  crew: { name: string; you: boolean }[];
  postedToday: boolean;
  hits: { t: number; dmg: number }[];
  hpMax: number;
  left: number;
  slain: boolean;
  killedAt: number | null;
  tickets: number;
  xp: number;
  badges: TeamBadge[];
  activity: { text: string; at: string }[];
};

const PRIZES = [
  { n: "Merch pack", p: 15, icon: "gift", how: "Pick a Verbalore hoodie or tote. Your manager arranges delivery.", kind: "item" },
  { n: "2 extra tickets", p: 30, icon: "coins", how: "Added to your tickets right now.", kind: "tix", v: 2 },
  { n: "$25 gift card", p: 8, icon: "mailbox", how: "Arrives by email within two days.", kind: "item" },
  { n: "Grand prize entry", p: 2, icon: "trophy", how: "You are in the season grand prize draw.", kind: "item" },
  { n: "Half day off", p: 5, icon: "calendar", how: "Choose a half day with your manager.", kind: "item" },
  { n: "1 extra ticket", p: 30, icon: "coins", how: "Added to your tickets right now.", kind: "tix", v: 1 },
  { n: "Team lunch", p: 10, icon: "bell", how: "Lunch for you and your squad.", kind: "item" },
] as const;

const CROWNS = ["Most Consistent", "Breakout Hit", "Fastest on a Signal", "Comeback Kid", "Most Popular"];
const BOX_COST = 3;
const LOOT_TICKETS = 5;

type Mine = { n: string; d: string; st: "To claim" | "Claimed"; how: string };
type Ledger = { spent: number; won: number; claimed: number[]; mine: Mine[] };
const EMPTY: Ledger = { spent: 0, won: 0, claimed: [], mine: [] };

type Arena = { ctx: CanvasRenderingContext2D | null; atk: number; p: number; flash: number; shake: number; fade: number; dead: boolean; bx: number; by: number };

function readLedger(ws: string): Ledger {
  try {
    return { ...EMPTY, ...JSON.parse(localStorage.getItem(`vl-prizes:${ws}`) || "{}") };
  } catch {
    return EMPTY;
  }
}
function writeLedger(ws: string, l: Ledger) {
  try {
    localStorage.setItem(`vl-prizes:${ws}`, JSON.stringify(l));
  } catch {}
}

function rng(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function sha(s: string): Promise<string> {
  if (window.crypto && crypto.subtle && window.TextEncoder)
    return crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)).then((b) => Array.prototype.map.call(new Uint8Array(b), (x: number) => ("0" + x.toString(16)).slice(-2)).join(""));
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Promise.resolve(("00000000" + (h >>> 0).toString(16)).slice(-8).repeat(4));
}
function rhex() {
  const a = new Uint8Array(8);
  if (window.crypto && crypto.getRandomValues) crypto.getRandomValues(a);
  else for (let i = 0; i < 8; i++) a[i] = Math.floor(Math.random() * 256);
  return Array.prototype.map.call(a, (x: number) => ("0" + x.toString(16)).slice(-2)).join("");
}

function useGame() {
  const [game, setGame] = useState("light");
  useEffect(() => {
    const read = () => setGame(document.body.dataset.game || "light");
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.body, { attributes: true, attributeFilter: ["data-game"] });
    return () => mo.disconnect();
  }, []);
  return game;
}

function when(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const days = Math.floor((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86_400_000);
  if (days <= 0) return `Today, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;
  if (days === 1) return "Yesterday";
  if (days < 7) return d.toLocaleDateString("en-US", { weekday: "short" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function TeamScreen({ data }: { data: TeamData }) {
  const game = useGame();
  const [tab, setTab] = useState<"week" | "season" | "rewards">("week");
  const [ledger, setLedger] = useState<Ledger>(EMPTY);
  const [ready, setReady] = useState(false);
  const [msg, setMsg] = useState("");
  const [replaying, setReplaying] = useState(false);
  const [loot, setLoot] = useState(false);
  const [box, setBox] = useState<{ state: "idle" | "opening" | "won"; won: number | null }>({ state: "idle", won: null });
  const [fairMsg, setFairMsg] = useState<React.ReactNode>("");
  const [sealedText, setSealedText] = useState("Open a box first.");
  const [canVerify, setCanVerify] = useState(false);
  const [toastText, setToastText] = useState("");

  const hp = useRef({ v: data.hpMax });
  const fillRef = useRef<HTMLElement>(null);
  const txtRef = useRef<HTMLSpanElement>(null);
  const bossRef = useRef<HTMLCanvasElement>(null);
  const arenaRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const reduce = useRef(false);
  const busy = useRef(false);
  const sealed = useRef<{ seed: string; pi: number; h: string } | null>(null);
  const pix = useRef<typeof import("@/lib/game-pixel.js") | null>(null);
  const arena = useRef<Arena | null>(null);
  const [pixelReady, setPixelReady] = useState(false);

  const tix = Math.max(0, data.tickets + LOOT_TICKETS * ledger.claimed.length + ledger.won - ledger.spent);
  const looks = useCallback((n: number) => (pix.current ? pix.current.LOOKS.slice(0, Math.max(1, n)) : []), []);

  const toast = useCallback((m: string) => {
    setToastText(m);
    const t = toastRef.current;
    if (!t) return;
    gsap.killTweensOf(t);
    gsap.to(t, { opacity: 1, y: 0, duration: reduce.current ? 0 : 0.2 });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => gsap.to(t, { opacity: 0, y: 32, duration: reduce.current ? 0 : 0.2 }), 2600);
  }, []);

  const paintHp = useCallback(() => {
    if (fillRef.current) fillRef.current.style.width = `${(hp.current.v / data.hpMax) * 100}%`;
    if (txtRef.current) txtRef.current.textContent = `${Math.round(hp.current.v).toLocaleString("en-US")} of ${data.hpMax.toLocaleString("en-US")} left`;
  }, [data.hpMax]);

  const setHP = useCallback(
    (v: number, anim: boolean) => {
      gsap.to(hp.current, { v: Math.max(0, v), duration: anim && !reduce.current ? 0.9 : 0, ease: "power2.out", onUpdate: paintHp });
      if (!anim || reduce.current) paintHp();
    },
    [paintHp]
  );

  // load the pixel engine in the browser, read the ledger, and show the boss as it stands today
  useEffect(() => {
    reduce.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setLedger(readLedger(data.wsId));
    setReady(true);
    let stop: (() => void) | undefined;
    let dead = false;
    import("@/lib/game-pixel.js").then((m) => {
      if (dead) return;
      pix.current = m;
      arena.current = m.newArena() as Arena;
      stop = m.watchTime(reduce.current);
      setPixelReady(true);
    });
    return () => {
      dead = true;
      stop?.();
    };
  }, [data.wsId]);

  // the boss portrait and the starting hit points
  useEffect(() => {
    if (!pixelReady || tab !== "week") return;
    if (bossRef.current) pix.current!.drawBossIcon(bossRef.current);
    hp.current.v = data.left;
    paintHp();
    const a = arena.current!;
    a.dead = data.slain;
    a.fade = data.slain ? 0 : 1;
    setMsg(
      data.hits.length === 0
        ? "No hits yet this week. Post a video to hit The Blank Page."
        : data.slain
        ? "The Blank Page is slain. Your squad earns a reward."
        : `${data.left.toLocaleString("en-US")} HP left. Post a video to hit it again.`
    );
  }, [pixelReady, tab, data.left, data.slain, data.hits.length, paintHp]);

  // the arena only runs when the game is on full
  useEffect(() => {
    if (!pixelReady || game !== "full" || tab !== "week" || !arenaRef.current) return;
    const a = arena.current!;
    a.ctx = arenaRef.current.getContext("2d");
    a.ctx!.imageSmoothingEnabled = false;
    const crewLooks = looks(data.crew.length);
    const tick = (t: number) => pix.current!.drawArena(a, crewLooks, t, reduce.current);
    gsap.ticker.add(tick);
    return () => gsap.ticker.remove(tick);
  }, [pixelReady, game, tab, data.crew.length, looks]);

  // a kill you have not claimed yet opens the reward once
  useEffect(() => {
    if (!ready || !data.slain || !data.killedAt || ledger.claimed.includes(data.killedAt) || tab !== "week") return;
    const t = setTimeout(() => setLoot(true), reduce.current ? 100 : 1300);
    return () => clearTimeout(t);
  }, [ready, data.slain, data.killedAt, ledger.claimed, tab]);

  function defeat() {
    const a = arena.current!;
    if (a.dead && a.fade === 0) return;
    a.dead = true;
    setMsg("The Blank Page is slain. Your squad earns a reward.");
    if (!reduce.current) gsap.to(a, { fade: 0, duration: 1.1 });
    else a.fade = 0;
  }

  // replay this week's real hits, one at a time, the way the design plays its fight
  function replay() {
    if (busy.current || !pixelReady) return;
    const a = arena.current!;
    busy.current = true;
    setReplaying(true);
    a.dead = false;
    a.fade = 1;
    setMsg("");
    hp.current.v = data.hpMax;
    paintHp();
    let i = 0;
    const next = () => {
      if (i >= data.hits.length) {
        busy.current = false;
        setReplaying(false);
        if (data.slain) defeat();
        else setMsg(data.hits.length ? `${data.left.toLocaleString("en-US")} HP left. Post a video to hit it again.` : "No hits yet this week. Post a video to hit The Blank Page.");
        return;
      }
      const h = data.hits[i++];
      pix.current!.hitBoss(
        a,
        0,
        () => {
          if (fxRef.current) pix.current!.dmgNum(a, fxRef.current, h.dmg, reduce.current);
          setHP(hp.current.v - h.dmg, true);
        },
        next,
        reduce.current
      );
    };
    next();
  }

  function save(l: Ledger) {
    setLedger(l);
    writeLedger(data.wsId, l);
  }

  function claimLoot() {
    setLoot(false);
    if (data.killedAt) save({ ...ledger, claimed: [...ledger.claimed, data.killedAt] });
    toast("Reward claimed");
  }

  function turnOn() {
    document.body.dataset.game = "light";
    try {
      const s = JSON.parse(localStorage.getItem("vl-display") || "{}");
      localStorage.setItem("vl-display", JSON.stringify({ ...s, game: "light" }));
    } catch {}
    window.dispatchEvent(new CustomEvent("vl-game", { detail: "light" }));
  }

  const opening = box.state === "opening";
  function openBox() {
    if (opening || tix < BOX_COST) return;
    const spent = { ...ledger, spent: ledger.spent + BOX_COST };
    save(spent);
    setBox({ state: "opening", won: null });
    setFairMsg("");
    setCanVerify(false);
    const seed = rhex();
    const r = rng(parseInt(seed.slice(0, 8), 16))() * 100;
    let acc = 0;
    let pi = 1;
    for (let i = 0; i < PRIZES.length; i++) {
      acc += PRIZES[i].p;
      if (r < acc) {
        pi = i;
        break;
      }
    }
    sha(`${seed}|${pi}`).then((h) => {
      sealed.current = { seed, pi, h };
      setSealedText(`Locked code: ${h.slice(0, 16)}... (shown in full to your admin)`);
      const fin = () => {
        const p = PRIZES[pi];
        const next: Ledger = { ...spent };
        if (p.kind === "tix") next.won = spent.won + p.v;
        else next.mine = [{ n: p.n, d: new Date().toLocaleDateString("en-US", { month: "short", day: "numeric" }), st: "To claim", how: p.how }, ...spent.mine];
        save(next);
        setBox({ state: "won", won: pi });
        setCanVerify(true);
        toast(`You won: ${p.n}`);
      };
      if (reduce.current) return fin();
      const sk = stageRef.current?.querySelector(".stk");
      if (!sk) return fin();
      gsap.timeline({ onComplete: fin }).to(sk, { rotation: -10, duration: 0.07, repeat: 9, yoyo: true }).to(sk, { rotation: 0, scale: 1.15, duration: 0.2, ease: "pop" });
    });
  }

  function verify() {
    const s = sealed.current;
    if (!s) return;
    sha(`${s.seed}|${s.pi}`).then((h) => {
      const ok = h === s.h;
      setFairMsg(
        ok ? (
          <>
            <span className="pill ok">Verified</span> Your prize was locked in before you opened the box, and it has not changed.
          </>
        ) : (
          <>
            <span className="pill">Does not match</span> Something is wrong. Please tell your manager.
          </>
        )
      );
      setSealedText(`Locked code: ${s.h.slice(0, 16)}... Check code: ${h.slice(0, 16)}...`);
      toast(ok ? "Verified" : "Does not match");
    });
  }

  function claimPrize(i: number) {
    const mine = ledger.mine.map((m, k) => (k === i ? { ...m, st: "Claimed" as const } : m));
    save({ ...ledger, mine });
    toast("Marked as claimed on this device");
  }

  const prize = box.won !== null ? PRIZES[box.won] : null;
  const squadXp = data.xp;

  return (
    <section className="screen" data-screen="team">
      <div className="tabs tabs2" role="tablist" id="teamTabs">
        {(
          [
            ["week", "This week"],
            ["season", "Season"],
            ["rewards", "Rewards"],
          ] as const
        ).map(([k, label]) => (
          <button key={k} role="tab" data-t={k} aria-selected={tab === k} onClick={() => setTab(k)}>
            {label}
          </button>
        ))}
      </div>

      <div id="teamOff" className="card g-off">
        <h2>Team activity</h2>
        <p className="muted" style={{ margin: ".5rem 0 1rem" }}>
          The game is off, so there are no scores or rankings. Your team&apos;s recent posts appear here.
        </p>
        <div className="crew" id="activity">
          {data.activity.length ? (
            data.activity.map((a, i) => (
              <div className="crow" key={i}>
                <span>{a.text}</span>
                <span className="muted" suppressHydrationWarning>{ready ? when(a.at) : ""}</span>
              </div>
            ))
          ) : (
            <p className="muted">Nothing yet. A finished video shows up here.</p>
          )}
        </div>
        <p style={{ marginTop: "1rem" }}>
          <button className="btn primary" data-game-set="light" onClick={turnOn}>
            Turn the game on
          </button>
        </p>
      </div>

      <div className="g-on">
        <div data-team="week" hidden={tab !== "week"}>
          <div className="teamgrid">
            <div>
              <div className="card" style={{ marginBottom: "1rem" }}>
                <div className="bossline">
                  <canvas id="bossIcon" ref={bossRef} width={42} height={46}></canvas>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h2>This week&apos;s challenge: The Blank Page</h2>
                    <p className="muted">Every video your squad posts chips away at it. Slay it with your best ideas this week for tickets and a badge.</p>
                  </div>
                </div>
                <div className="hp" style={{ marginTop: "1rem" }}>
                  <i id="hpFill" ref={fillRef as React.RefObject<HTMLElement>}></i>
                  <span id="hpTxt" ref={txtRef}></span>
                </div>
              </div>
              <div className="arena g-full" id="arenaBox">
                <canvas id="arenaCanvas" ref={arenaRef} width={320} height={180} aria-label="Your crew facing the Blank Page"></canvas>
                <div className="fx" id="fx" ref={fxRef}></div>
              </div>
              <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "1rem" }}>
                <button className="btn primary" id="endDay" onClick={replay} disabled={replaying || !data.hits.length}>
                  Replay this week&apos;s hits
                </button>
              </div>
              <p className="muted" id="weekMsg" style={{ marginTop: ".6rem" }} role="status">
                {msg}
              </p>
            </div>
            <div className="card">
              <h3>Your squad</h3>
              <div className="crew" id="crewList" style={{ marginTop: ".5rem" }}>
                {data.crew.map((c, i) => (
                  <div className="crow" key={i}>
                    <span>{c.you ? "You" : c.name}</span>
                    <b className={i ? "mono" : ""}>{c.you ? (data.postedToday ? "Posted today" : "Not yet today") : "Member"}</b>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ fontSize: ".9rem", marginTop: ".75rem" }}>
                Hit power comes from the strength of the idea you post and the length of your streak.
              </p>
            </div>
          </div>
        </div>

        <div data-team="season" hidden={tab !== "season"}>
          <div className="card">
            <h2>League</h2>
            <p className="muted" style={{ margin: ".4rem 0 1rem" }}>
              Squads arrive when a second team joins. The top two squads move up a division at the end of the season.
            </p>
            <ol className="lanes" id="lanes">
              <li className="lane me" data-flip-id={data.wsName}>
                <b className="mono">1</b>
                <span>{data.wsName} (your squad)</span>
                <span className="bar">
                  <i style={{ width: `${Math.min(100, (squadXp / 8000) * 100)}%` }}></i>
                </span>
                <span className="mono">{squadXp.toLocaleString("en-US")}</span>
              </li>
            </ol>
          </div>
          <div className="card" style={{ marginTop: "1rem" }}>
            <h3>Crowns this season</h3>
            <div className="crew" id="crowns" style={{ marginTop: ".5rem" }}>
              {CROWNS.map((c) => (
                <div className="crow" key={c}>
                  <b>{c}</b>
                  <span className="muted">Not awarded yet</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div data-team="rewards" hidden={tab !== "rewards"}>
          {/* the art paints at the size it is shown at, so it is only built while this tab is open, as in the design */}
          {tab === "rewards" && (
          <>
          <div className="teamgrid">
            <div className="card prize">
              <div className="prize-top">
                <h2>Prize box</h2>
                <div className="tixpill">
                  <Sticker name="coins" size={2.2} still label="coins sticker" />
                  <span>
                    <b className="mono" id="tixNum">{tix}</b> {tix === 1 ? "ticket" : "tickets"}
                  </span>
                </div>
              </div>
              <div className="prize-stage" id="prizeStage" ref={stageRef} aria-live="polite">
                {box.state === "idle" && (
                  <>
                    <Sticker name="gift" size={9} enter={0.1} label="A closed prize box" />
                    <div>
                      <h3>Ready to open</h3>
                      <p className="muted">Open a box to see what is inside.</p>
                    </div>
                  </>
                )}
                {box.state === "opening" && (
                  <>
                    <Sticker name="gift" size={9} label="Opening the box" />
                    <div>
                      <h3>Opening...</h3>
                    </div>
                  </>
                )}
                {box.state === "won" && prize && (
                  <>
                    <Sticker name={prize.icon} size={9} enter={0} label={prize.n} />
                    <div>
                      <span className="pill ok">You won</span>
                      <h3 style={{ marginTop: ".45rem" }}>{prize.n}</h3>
                      <p className="muted" style={{ marginTop: ".3rem" }}>{prize.how}</p>
                    </div>
                  </>
                )}
              </div>
              <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center" }}>
                <button className="btn primary lg" id="openBox" onClick={openBox} disabled={opening || tix < BOX_COST}>
                  {box.state === "won" ? "Open another box, 3 tickets" : "Open a box, 3 tickets"}
                </button>
              </div>
              <p className="muted" id="boxHelp">
                {tix < BOX_COST ? `You need 3 tickets. You have ${tix}. You earn one each time you post.` : "A box costs 3 tickets. You earn tickets by posting videos."}
              </p>
              <details className="fair" id="fair">
                <summary>Is this fair?</summary>
                <div className="fairbody">
                  <p>Before you open a box, Verbalore locks in your prize with a private code. Nobody can change it afterwards, not even us. After you open a box, press Check to prove it.</p>
                  <div>
                    <button className="btn" id="verifyBox" onClick={verify} disabled={!canVerify}>
                      Check my last box
                    </button>
                  </div>
                  <p className="fairmsg" id="fairMsg" role="status">{fairMsg}</p>
                  <details className="tech">
                    <summary>Technical details</summary>
                    <div className="sealed" id="sealed">{sealedText}</div>
                  </details>
                </div>
              </details>
            </div>
            <div className="card">
              <h3>What you can win</h3>
              <div id="odds" style={{ marginTop: ".5rem" }}>
                {PRIZES.map((p) => (
                  <div className="win" key={p.n}>
                    <Sticker name={p.icon} size={3} still label={p.n} />
                    <div>
                      <b>{p.n}</b>
                      <small>{p.how}</small>
                    </div>
                    <span className="chance">{p.p} in 100</span>
                  </div>
                ))}
              </div>
              <p className="muted" style={{ fontSize: ".9rem", marginTop: ".7rem" }}>
                Prizes are non-cash by default. Tickets are earned, never bought. This prize shelf is a sample until a manager stocks it.
              </p>
            </div>
          </div>
          <div className="card" style={{ marginTop: "1rem" }}>
            <h3>Your prizes</h3>
            <div className="crew" id="myPrizes" style={{ marginTop: ".5rem" }}>
              {ledger.mine.length ? (
                ledger.mine.map((m, i) => (
                  <div className="crow" key={i}>
                    <div>
                      <b>{m.n}</b>
                      <div className="muted" style={{ fontSize: ".9rem" }}>{m.d}{m.how ? `. ${m.how}` : ""}</div>
                    </div>
                    {m.st === "To claim" ? (
                      <button className="btn sm primary" data-claim={i} onClick={() => claimPrize(i)}>
                        Claim
                      </button>
                    ) : (
                      <span className="pill ok">Claimed</span>
                    )}
                  </div>
                ))
              ) : (
                <p className="muted">Nothing yet. Open a box to win something.</p>
              )}
            </div>
            <p className="muted" style={{ fontSize: ".85rem", marginTop: ".75rem" }}>Boxes you open are kept on this device.</p>
          </div>
          <div className="card" style={{ marginTop: "1rem" }}>
            <h3>Badges</h3>
            <div className="badges" id="badges" style={{ marginTop: "1rem" }}>
              {data.badges.map((b) => {
                const on = b.have >= b.need;
                return (
                  <div className={`badge${on ? "" : " lock"}`} key={b.id}>
                    <Sticker name={b.icon} size={6} locked={!on} label={`${b.name}${on ? "" : ", locked"}`} />
                    <b>{b.name}</b>
                    <small>
                      {b.how}
                      {on ? ". Earned." : `. Locked. ${Math.min(b.have, b.need)} of ${b.need} ${b.unit}.`}
                    </small>
                  </div>
                );
              })}
            </div>
            <p className="muted" style={{ fontSize: ".85rem", marginTop: "1rem" }}>
              Badge and prize art made with fun-isometric by Kelvin Adithya (MIT license), github.com/kelvinkn17/skills.
            </p>
          </div>
          </>
          )}
        </div>
      </div>

      <div className="modal" id="loot" hidden={!loot}>
        <div className="card box" role="dialog" aria-modal="true" aria-labelledby="lTitle" style={{ textAlign: "center" }}>
          <h2 id="lTitle">The Blank Page is slain</h2>
          <p className="muted">Your squad finished it this week. Here is your reward.</p>
          <div className="crew" style={{ textAlign: "left" }}>
            <div className="crow">
              <span>Tickets</span>
              <b className="mono">+{LOOT_TICKETS}</b>
            </div>
            <div className="crow">
              <span>Badge</span>
              <b>Page Turner</b>
            </div>
          </div>
          <button className="btn primary lg" id="lootClose" onClick={claimLoot}>
            Claim reward
          </button>
        </div>
      </div>
      <div className="toast" id="teamToast" ref={toastRef} role="status" aria-live="polite">
        {toastText}
      </div>
    </section>
  );
}
