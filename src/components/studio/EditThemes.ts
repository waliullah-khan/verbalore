import { THEMES } from "@/lib/usecases";

// The first six looks keep the design's own names and colours. Every other look comes from the renderer's THEMES.
export const THEME_ORDER = ["editorial", "kinetic", "product", "listing", "terminal", "boardroom"] as const;

export const THEME_INFO: Record<string, [name: string, blurb: string, paper: string, accent: string]> = {
  editorial: ["Editorial", "Warm paper and a serif headline", "#f6f2ea", "#c2410c"],
  kinetic: ["Kinetic", "Giant type on dark", "#0e0e12", "#ffd24a"],
  product: ["Product", "Clean app panels", "#e8eefc", "#2f5bea"],
  listing: ["Listing", "Navy with gold numbers", "#14213d", "#d9b25f"],
  terminal: ["Terminal", "Code window and mono type", "#0b100d", "#4ade80"],
  boardroom: ["Boardroom", "Restrained navy and white", "#0f2742", "#7cc4ff"],
};

// Thumbnail gradients for the first six looks.
export const THEME_GRADIENT: Record<string, [string, string]> = {
  editorial: ["#c2410c", "#3b1d0f"],
  kinetic: ["#1a1a22", "#ffd24a"],
  product: ["#2f5bea", "#0f1a2b"],
  listing: ["#14213d", "#d9b25f"],
  terminal: ["#0b100d", "#2f8f55"],
  boardroom: ["#0f2742", "#2d6aa3"],
};

type Entry = { label: string; blurb: string; swatch?: readonly string[] };
const all = () => THEMES as unknown as Record<string, Entry>;

export type ThemeOption = { id: string; name: string; blurb: string; paper: string | null; accent: string | null; group: "core" | "more" };

// Every look the renderer offers, the original six first.
export function themeOptions(): ThemeOption[] {
  const known = all();
  const core = new Set<string>(THEME_ORDER);
  const ids = [...THEME_ORDER.filter((k) => k in known), ...Object.keys(known).filter((k) => !core.has(k))];
  return ids.map((id) => {
    const t = known[id];
    const info = THEME_INFO[id];
    return {
      id,
      name: info?.[0] ?? t.label,
      blurb: info?.[1] ?? t.blurb,
      paper: t.swatch?.[0] ?? info?.[2] ?? null,
      accent: t.swatch?.[1] ?? info?.[3] ?? null,
      group: core.has(id) ? "core" : "more",
    };
  });
}

export const themeName = (id: string) => THEME_INFO[id]?.[0] ?? all()[id]?.label ?? id;

const NEUTRAL: [string, string] = ["#2b3648", "#141b27"];
export const gradientOf = (id: string): [string, string] => {
  const sw = all()[id]?.swatch;
  return THEME_GRADIENT[id] ?? (sw && sw.length > 1 ? [sw[0], sw[1]] : NEUTRAL);
};

export const fmtClock = (s: number) => {
  const t = Math.max(0, Math.round(s));
  return `${Math.floor(t / 60)}:${("0" + (t % 60)).slice(-2)}`;
};
