"use client";

import { useEffect, useRef, useState } from "react";
import { useStudio } from "./Shell";
import { BLD, createLot } from "@/lib/lot-scene.js";

const LW = 448;
const LH = 216;
const GY = 172;

const FLOW = ["today", "record", "edit", "post"];

// The design's words for each step.
const NEXTTXT: Record<string, [string, string, string]> = {
  today: ["Choose today's idea", "Your ideas are ready. Pick the one you like best.", "Choose an idea"],
  record: ["Record your video", "Your script is ready for the teleprompter.", "Go to Record"],
  edit: ["Check the edit", "Your video is cut and captioned. Adjust anything, then continue.", "Open the editor"],
  post: ["Post your video", "Choose where it goes and when.", "Go to Post"],
  done: ["You are done for today", "Your video is out. Look at how past videos did, or check your signals.", "Open the Library"],
};

type Building = { id: string; name: string; plain: string; x: number; w: number; h: number };

// The studio lot: a card for the next step, then the pixel-art lot (or a plain list of the same places).
export default function HomeScreen() {
  const { state, game, go } = useStudio();
  const canvas = useRef<HTMLCanvasElement>(null);
  const lot = useRef<{ setHot: (i: number) => void; destroy: () => void } | null>(null);
  const targetRef = useRef("today");
  const [view, setView] = useState<"map" | "list">("map");
  const userSet = useRef(false);

  const n = state.next;
  const targetId = n === "done" ? "library" : n;
  targetRef.current = targetId;
  const idx = FLOW.indexOf(n);

  const statusOf = (id: string) => {
    if (id === "team") return game === "off" ? "Team activity" : state.status.team;
    return state.status[id as keyof typeof state.status];
  };

  // the lot draws itself every frame, so the lit building follows the next step
  useEffect(() => {
    if (!canvas.current) return;
    const l = createLot(canvas.current, { targetId: () => targetRef.current });
    lot.current = l;
    // the labels rise in one after another; done as a CSS animation so it keeps the chip's own centring and hover lift
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.querySelectorAll<HTMLElement>(".spot .chip").forEach((chip, i) => {
        chip.animate(
          [{ opacity: 0, transform: "translateX(-50%) translateY(8px)" }, { opacity: 1, transform: "translateX(-50%) translateY(0)" }],
          { duration: 400, delay: 200 + i * 60, fill: "backwards", easing: "ease-out" }
        );
      });
    }
    return () => { l.destroy(); lot.current = null; };
  }, []);

  // a narrow frame, or the game turned off, starts on the list unless they chose a view themselves
  useEffect(() => {
    const frame = document.getElementById("frame");
    const auto = () => {
      if (userSet.current) return;
      const w = frame?.clientWidth ?? 0;
      setView(game === "off" || (w > 0 && w < 700) ? "list" : "map");
    };
    auto();
    if (!frame || !window.ResizeObserver) return;
    const ro = new ResizeObserver(auto);
    ro.observe(frame);
    return () => ro.disconnect();
  }, [game]);

  const pick = (v: "map" | "list") => { userSet.current = true; setView(v); };

  return (
    <section className="screen" data-screen="home">
      <div className="card next" id="nextCard">
        <div style={{ minWidth: 0 }}>
          <span className="lab muted">{n === "done" ? "All done" : `Your next step${idx >= 0 ? `, step ${idx + 1} of 4` : ""}`}</span>
          <h2 style={{ marginTop: ".2rem" }}>{NEXTTXT[n][0]}</h2>
          <p className="muted" style={{ marginTop: ".3rem" }}>{n === "today" && state.ideasReady > 0 ? `${state.ideasReady} idea${state.ideasReady === 1 ? " is" : "s are"} ready. Pick the one you like best.` : NEXTTXT[n][1]}</p>
          <p className="g-on" style={{ marginTop: ".4rem" }}>
            <b>{n === "done" ? `Streak ${state.game.streak} ${state.game.streak === 1 ? "day" : "days"}. See you tomorrow.` : `Finish today to reach day ${state.game.streak + 1}.`}</b>
          </p>
        </div>
        <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
          <button className="btn primary lg" data-go={targetId}>{NEXTTXT[n][2]}</button>
          {n === "record" && <button className="btn lg" data-open-phone>Record on my phone</button>}
        </div>
      </div>

      <div className="viewbar">
        <div className="seg" id="viewSeg" role="group" aria-label="How to show your studio">
          <button data-v="map" aria-pressed={view === "map"} onClick={() => pick("map")}>Studio lot</button>
          <button data-v="list" aria-pressed={view === "list"} onClick={() => pick("list")}>Simple list</button>
        </div>
        <span className="muted" style={{ fontSize: ".95rem" }}>Same places either way. Pick what feels easier.</span>
      </div>

      <div id="homeMap" hidden={view !== "map"}>
        <div className="mapscroll">
          <div className="scene" id="scene">
            <canvas ref={canvas} id="homeCanvas" width={LW} height={LH} aria-label="Pixel art studio lot. Each building is a part of the app." />
            {(BLD as Building[]).map((b, i) => (
              <button
                key={b.id}
                className={`spot${b.id === targetId ? " isnext" : ""}`}
                data-spot={b.id}
                aria-label={`${b.plain}, ${b.name}. ${statusOf(b.id)}${b.id === targetId ? ". Your next step." : ""}`}
                style={{ left: `${(b.x / LW) * 100}%`, top: `${((GY - b.h - 4) / LH) * 100}%`, width: `${(b.w / LW) * 100}%`, height: `${((b.h + 4) / LH) * 100}%` }}
                onMouseEnter={() => lot.current?.setHot(i)}
                onFocus={() => lot.current?.setHot(i)}
                onMouseLeave={() => lot.current?.setHot(-1)}
                onBlur={() => lot.current?.setHot(-1)}
                onClick={(e) => {
                  try { sessionStorage.setItem("vl-click", JSON.stringify({ x: Math.round((e.clientX / window.innerWidth) * 100) || 50, y: Math.round((e.clientY / window.innerHeight) * 100) || 30 })); } catch {}
                  go(b.id);
                }}
              >
                <span className="chip"><b>{b.plain}</b><span>{b.name}, {statusOf(b.id)}</span></span>
              </button>
            ))}
          </div>
        </div>
        <p className="muted" style={{ fontSize: ".9rem", marginTop: ".6rem" }}>Every building is a part of the app. The lit sign and moving path show your next step.</p>
      </div>

      <div className="homelist" id="homeList" hidden={view !== "list"}>
        {(BLD as Building[]).map((b, i) => (
          <div key={b.id} className={`card hrow${b.id === targetId ? " isnext" : ""}`}>
            <span className="num">{i + 1}</span>
            <div><b>{b.plain}</b><div className="muted">{b.name}, {statusOf(b.id)}</div></div>
            <button className={`btn ${b.id === targetId ? "primary" : "quiet"}`} data-go={b.id}>{b.id === targetId ? "Next step" : "Open"}</button>
          </div>
        ))}
      </div>
    </section>
  );
}
