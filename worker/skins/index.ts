import type { Skin } from "./types";
import { typography } from "./families/typography";
import { productui } from "./families/productui";
import { explainer } from "./families/explainer";
import { generative } from "./families/generative";
import { handdrawn } from "./families/handdrawn";
import { cartoon } from "./families/cartoon";
import { pixel } from "./families/pixel";
import { retro } from "./families/retro";
import { collage } from "./families/collage";
import { lowpoly } from "./families/lowpoly";
import { cinematic3d } from "./families/cinematic3d";
import { photoreal } from "./families/photoreal";

// The twelve families from the style library, each a distinct look.
export const FAMILIES: Record<string, Skin> = {
  typography, productui, explainer, generative, handdrawn, cartoon, pixel, retro, collage, lowpoly, cinematic3d, photoreal,
};

// The six older theme names, mapped onto the families so videos made with them keep rendering.
export const LEGACY: Record<string, string> = {
  kinetic: "typography",
  product: "productui",
  terminal: "retro",
  boardroom: "explainer",
  listing: "photoreal",
  editorial: "collage",
};

export function skinFor(id: string): Skin {
  return FAMILIES[id] ?? FAMILIES[LEGACY[id]] ?? FAMILIES.typography;
}

export const isFamily = (id: string) => id in FAMILIES || id in LEGACY;
