"use client";

import { useEffect, useState } from "react";

const KEY = "vl-display";

function read(): { game?: string } {
  try {
    return JSON.parse(localStorage.getItem(KEY) || "{}");
  } catch {
    return {};
  }
}

// Asks once how much game the person wants, then stays away. It writes the same setting the Display menu does.
export default function IdeaBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    let chosen = false;
    try {
      chosen = !!read().game || localStorage.getItem("vl-banner-set") === "1";
    } catch {}
    setShow(!chosen);
  }, []);

  function choose(v: string) {
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...read(), game: v }));
      localStorage.setItem("vl-banner-set", "1");
    } catch {}
    document.body.dataset.game = v;
    window.dispatchEvent(new Event("vl-display"));
    setShow(false);
  }

  if (!show) return null;
  return (
    <div className="card banner" id="gameBanner">
      <div>
        <b>How much game would you like?</b>
        <p className="muted">Streaks, a team challenge and prizes can sit in the background or be turned off. You can change this any time.</p>
      </div>
      <div className="seg" id="bannerSeg">
        <button data-v="off" onClick={() => choose("off")}>Off</button>
        <button data-v="light" onClick={() => choose("light")}>A little</button>
        <button data-v="full" onClick={() => choose("full")}>Full game</button>
      </div>
    </div>
  );
}
