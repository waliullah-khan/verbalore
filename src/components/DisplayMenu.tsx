"use client";

import { useEffect, useState } from "react";

const SIZES: [string, string][] = [["Standard", "1"], ["Large", "1.15"], ["Extra large", "1.3"]];
const THEMES: [string, string][] = [["Match device", "auto"], ["Light", "light"], ["Dark", "dark"]];

const GAMES: [string, string][] = [["Off", "off"], ["A little", "light"], ["Full game", "full"]];

type Saved = { scale?: string; theme?: string; game?: string };

function load(): Saved {
  try {
    return JSON.parse(localStorage.getItem("vl-display") || "{}");
  } catch {
    return {};
  }
}

function save(next: Saved) {
  try {
    localStorage.setItem("vl-display", JSON.stringify(next));
  } catch {}
}

// Text size and appearance belong to the viewer, so they sit one tap away on every screen.
export default function DisplayMenu() {
  const [open, setOpen] = useState(false);
  const [scale, setScale] = useState("1");
  const [theme, setTheme] = useState("auto");
  const [game, setGame] = useState("light");

  useEffect(() => {
    const s = load();
    if (s.scale) setScale(s.scale);
    if (s.theme) setTheme(s.theme);
    if (s.game) setGame(s.game);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  function pickScale(v: string) {
    setScale(v);
    document.documentElement.style.setProperty("--scale", v);
    save({ ...load(), scale: v });
  }

  function pickTheme(v: string) {
    setTheme(v);
    if (v === "auto") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", v);
    save({ ...load(), theme: v });
  }

  function pickGame(v: string) {
    setGame(v);
    document.documentElement.setAttribute("data-game", v);
    save({ ...load(), game: v });
  }

  return (
    <div className="relative">
      <button className="btn btn-ghost" aria-expanded={open} aria-controls="display-panel" onClick={() => setOpen(!open)}>
        Display
      </button>
      {open && (
        <div id="display-panel" className="card absolute right-0 z-40 mt-2 grid w-[min(22rem,88vw)] gap-4">
          <div>
            <p className="label">Text size</p>
            <div className="seg">
              {SIZES.map(([label, v]) => (
                <button key={v} aria-pressed={scale === v} onClick={() => pickScale(v)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Appearance</p>
            <div className="seg">
              {THEMES.map(([label, v]) => (
                <button key={v} aria-pressed={theme === v} onClick={() => pickTheme(v)}>{label}</button>
              ))}
            </div>
          </div>
          <div>
            <p className="label">Game</p>
            <div className="seg">
              {GAMES.map(([label, v]) => (
                <button key={v} aria-pressed={game === v} onClick={() => pickGame(v)}>{label}</button>
              ))}
            </div>
            <p className="muted mt-1.5 text-sm">{game === "off" ? "No streaks or scores anywhere." : game === "light" ? "A streak and a weekly goal." : "Level, experience and badges too."}</p>
          </div>
        </div>
      )}
    </div>
  );
}
