// One still per style family in the Verbalore style library: 425 prompts across 12 families.

const FAMILIES: { id: string; name: string; line: string; count: number }[] = [
  { id: "typography", name: "Kinetic typography", line: "Giant words that move with the voice.", count: 52 },
  { id: "productui", name: "Product UI promo", line: "App windows, cursors and toasts.", count: 80 },
  { id: "explainer", name: "Explainers and data viz", line: "Charts, counters and diagrams.", count: 38 },
  { id: "generative", name: "Generative and neon", line: "Particles and flow fields.", count: 34 },
  { id: "cinematic3d", name: "Cinematic 3D", line: "Depth, lighting and slow camera moves.", count: 82 },
  { id: "pixel", name: "Pixel art", line: "Chunky sprites and stepped motion.", count: 22 },
  { id: "cartoon", name: "Flat cartoon", line: "Bold shapes with squash and stretch.", count: 43 },
  { id: "handdrawn", name: "Hand-drawn and comic", line: "Pencil lines, sketches, halftone.", count: 22 },
  { id: "collage", name: "Collage and cutout", line: "Paper, sand and handmade layers.", count: 6 },
  { id: "lowpoly", name: "Low-poly and voxel", line: "Faceted shapes and block worlds.", count: 32 },
  { id: "retro", name: "Retro, terminal, old film", line: "CRT glow, grain and monospace.", count: 5 },
  { id: "photoreal", name: "Photoreal and live action", line: "A restrained, filmed look.", count: 9 },
];

export default function StyleGrid() {
  /* eslint-disable @next/next/no-img-element */
  return (
    <div className="lp-styles">
      {FAMILIES.map((f) => (
        <figure key={f.id} className="lp-style" data-rise>
          <img src={`/landing/styles/${f.id}.jpg`} alt={`${f.name} style example`} width={480} height={270} loading="lazy" decoding="async" />
          <figcaption>
            <span className="lp-count">{f.count} PROMPTS</span>
            <b>{f.name}</b>
            <span>{f.line}</span>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
