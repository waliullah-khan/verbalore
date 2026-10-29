"use client";

import { useEffect, useRef, useState } from "react";
import type { LandingVideo } from "@/lib/landing-videos";

// Plays muted and looping only while on screen, and only fetches the file once it is near the viewport.
function Tile({ v }: { v: LandingVideo }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.muted = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) el.controls = true;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting && !reduce) {
          if (!el.getAttribute("src")) el.setAttribute("src", v.url);
          el.play().catch(() => {});
        } else {
          el.pause();
        }
      },
      { threshold: 0.4 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [v.url]);

  function toggle() {
    const el = ref.current;
    if (!el) return;
    el.muted = !el.muted;
    setMuted(el.muted);
  }

  return (
    <figure className="lp-tile" style={{ margin: 0 }} data-rise>
      <div className="lp-vid">
        <video ref={ref} poster={v.poster} loop muted playsInline preload="none" aria-label={v.title} />
        <button type="button" className="lp-snd" onClick={toggle} aria-pressed={!muted}>
          {muted ? "Sound on" : "Sound off"}
        </button>
      </div>
      <span className="lp-fam">{v.family}</span>
      <b>{v.title}</b>
    </figure>
  );
}

export default function Showreel({ videos }: { videos: LandingVideo[] }) {
  return (
    <div className="lp-reel">
      {videos.map((v) => (
        <Tile key={v.url} v={v} />
      ))}
    </div>
  );
}
