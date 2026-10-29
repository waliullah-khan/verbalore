"use client";

import { useEffect, useRef } from "react";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { FUN?: any }
}

// The pixel-art sticker library (fun-isometric, MIT) sets window.FUN when it loads.
export async function loadFun(): Promise<any> {
  if (typeof window === "undefined") return null;
  if (!window.FUN) await import("@/lib/fun-isometric.js");
  return window.FUN ?? null;
}

const palette = (FUN: any, locked: boolean) =>
  locked ? FUN.mono("#8b95a3") : Object.assign({}, FUN.brand("#c2410c", "#0f1a2b"), { gold: "#ffc933" });

type Props = {
  name: string;
  size?: string | number;
  label?: string;
  locked?: boolean;
  still?: boolean;
  enter?: number;
  className?: string;
  style?: React.CSSProperties;
};

// Same as the design's mountStickers(): a canvas inside a .stk span that plays the icon, or paints one still frame.
export default function Sticker({ name, size = "3", label, locked, still, enter, className = "", style }: Props) {
  const host = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let stop: (() => void) | undefined;
    let dead = false;
    loadFun().then((FUN) => {
      const el = host.current;
      if (!FUN || !el || dead) return;
      const icon = FUN.ICONS[name];
      if (!icon) return;
      const cv = document.createElement("canvas");
      cv.style.width = `${size}rem`;
      cv.style.height = `${size}rem`;
      cv.setAttribute("role", "img");
      cv.setAttribute("aria-label", label || `${name} sticker`);
      el.appendChild(cv);
      if (locked || still) {
        cv.style.opacity = locked ? "0.5" : "1";
        requestAnimationFrame(() => FUN.paint(cv, icon, icon.still || 0, 1, palette(FUN, !!locked)));
        stop = () => cv.remove();
        return;
      }
      const player = FUN.play(cv, icon, { palette: palette(FUN, false), enter });
      stop = () => { player?.stop?.(); cv.remove(); };
    });
    return () => { dead = true; stop?.(); };
  }, [name, size, label, locked, still, enter]);

  return (
    <span
      ref={host}
      className={`stk ${className}`.trim()}
      data-stk={name}
      data-size={String(size)}
      data-label={label}
      data-locked={locked ? "1" : undefined}
      style={style}
    />
  );
}
