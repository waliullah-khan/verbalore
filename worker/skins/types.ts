import type { SceneType } from "../../src/lib/usecases";
import type { Scene, Word } from "../plan";

export type Brand = { accent: string; paper: string; ink: string };

// Where the speaker sits while a beat is on screen.
export type Mode = "full" | "bottom" | "pip" | "cutout";

export type Pal = {
  bg: string;
  bg2: string;
  ink: string;
  sub: string;
  accent: string;
  accent2: string;
  card: string;
  edge: string;
  onAccent: string;
};

export type Beat = {
  i: number;
  n: number;
  start: number;
  end: number;
  dur: number;
  scene: Scene;
  mode: Mode;
  keyword: string;
  kwAt: number;
  words: Word[];
  seed: number;
};

// A piece of markup and the timeline lines that animate it.
export type Out = { html: string; js: string };

export type Reveal = "mask" | "pop" | "type" | "steps" | "draw" | "flicker" | "tilt3d" | "fade";
export type Trans = "wipe" | "slice" | "iris" | "zoom" | "push" | "glitch" | "flash" | "dip" | "steps";

// full: the backdrop covers the whole frame (cutout layout) instead of only the deck under the speaker
export type Ctx = { dur: number; p: Pal; brandName: string; n: number; seed: number; full?: boolean };

export interface Skin {
  id: string;
  label: string;
  blurb: string;
  pal(b: Brand): Pal;
  fonts: string[];
  head: string;
  body: string;
  mono: string;
  css(p: Pal): string;
  // animated background, always moving
  bg(c: Ctx): Out;
  // per-beat motif: bursts, shapes, doodles
  decor(b: Beat, c: Ctx): Out;
  reveal: Reveal;
  trans: Trans[];
  caption: "karaoke" | "bar" | "type" | "pop" | "none";
  // spoken words become giant cards that cut on the beat
  kinetic?: boolean;
  speaker: { radius: number; border?: { w: number; c: string }; shadow?: string; pip?: number };
  scrim: string;
  stepFps?: number;
  // wide pixel fonts need smaller sizes
  fontScale?: number;
  // average letter width in ems as it is actually set (capitals run wider), used to keep long words inside the frame
  charW?: number;
  // caption words before they are spoken (they turn to accent2 as each is said)
  capBase?: string;
  modes?: Partial<Record<SceneType, Mode>>;
}
