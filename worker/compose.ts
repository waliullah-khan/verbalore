import type { ThemeId } from "../src/lib/usecases";
import type { Scene, Word } from "./plan";
import { composeShowreel, captionChunks } from "./skins/engine";
import { skinFor } from "./skins";
import type { Brand } from "./skins/types";

export type { Brand };
export type Theme = ThemeId;
export { captionChunks };

// The edit: a showreel built by the engine in worker/skins from the planned scenes and the chosen skin.
export function composeHtml(args: {
  scenes: Scene[];
  words: Word[];
  duration: number;
  brand: Brand;
  theme: Theme;
  videoFile: string;
  brandName: string;
  seed?: string;
}): string {
  return composeShowreel({ ...args, skin: skinFor(args.theme) });
}
