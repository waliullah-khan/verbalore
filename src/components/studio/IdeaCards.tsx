"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import Sticker from "./Sticker";
import { setProject } from "./IdeaProject";

export type IdeaCardData = {
  id: string;
  hook: string;
  why: string;
  str: "epic" | "rare" | "common";
  label: string;
  rar: string;
  hit: number;
  fmt: string;
  seconds: number;
  src: number;
  lines: string[];
  sample: boolean;
};

function Card({ c, feat }: { c: IdeaCardData; feat: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  return (
    <article className={`card idea ${c.str}${feat ? " feat" : ""}`} data-i={c.id}>
      {feat && <Sticker name="bulb" size={4.4} label="Idea bulb" className="g-on" style={{ position: "absolute", right: "1.4rem", top: "1.2rem" }} />}
      <div className="str">
        <span className={`pill ${c.str === "epic" ? "acc" : ""}`}>{c.label}</span>
        <span className="pill g-full">{c.rar}, hit power {c.hit}</span>
        <span className="muted" style={{ fontSize: ".9rem" }}>{c.fmt}, about {c.seconds} seconds</span>
        {c.sample && <span className="pill">sample data</span>}
      </div>
      <h3>{c.hook}</h3>
      <p className="why">Why now: {c.why} Based on {c.src} source{c.src === 1 ? "" : "s"}.</p>
      <div className="scriptprev" hidden={!open}>
        {c.lines.map((l, i) => <p key={i}>{l}</p>)}
        <p><Link href={`/ideas/${c.id}`} onClick={() => setProject(c.id)} style={{ fontWeight: 700, textDecoration: "underline", textUnderlineOffset: "3px" }}>See the sources and the example it learns from</Link></p>
      </div>
      <div className="acts">
        <button className="btn primary" onClick={() => { setProject(c.id); router.push(`/studio/${c.id}`); }}>Record this idea</button>
        <button className="btn quiet" onClick={() => setOpen(!open)}>{open ? "Hide the script" : "Read the script"}</button>
      </div>
    </article>
  );
}

// The five idea cards, with the design's own entrance: they rise in one after another.
export default function IdeaCards({ cards }: { cards: IdeaCardData[] }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const ctx = gsap.context(() => {
      gsap.from(".idea", { opacity: 0, y: 18, stagger: 0.07, duration: 0.4, ease: "power2.out" });
    }, root);
    return () => ctx.revert();
  }, [cards]);

  return (
    <div className="ideas" id="ideas" ref={root}>
      {cards.map((c, i) => <Card key={c.id} c={c} feat={i === 0} />)}
    </div>
  );
}
