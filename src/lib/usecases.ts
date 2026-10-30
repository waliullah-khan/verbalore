// A use case decides what gets researched, which script formats are offered, which graphics
// the planner reaches for, and which edit themes show up in the Studio.

export type SceneType = "hook" | "stat" | "list" | "quote" | "tip" | "cta" | "code" | "compare" | "facts" | "keyword" | "stack";
export type ThemeId =
  | "editorial" | "kinetic" | "product" | "listing" | "terminal" | "boardroom"
  | "auto" | "typography" | "productui" | "explainer" | "generative" | "handdrawn" | "cartoon"
  | "pixel" | "retro" | "collage" | "lowpoly" | "cinematic3d" | "photoreal";
export type UseCaseId = "real_estate" | "developers" | "product_marketing" | "gtm" | "c_suite" | "founders" | "general";

export type Playbook = {
  id: UseCaseId;
  label: string;
  tagline: string;
  // used for research and writing when the workspace is the demo; real workspaces keep their own profile
  demo: { niche: string; offer: string; icp: string };
  topic: string;
  formats: { name: string; pattern: string }[];
  hooks: string[];
  scenes: SceneType[];
  themes: ThemeId[]; // the first one is the default
};

export const THEMES: Record<ThemeId, { label: string; blurb: string; family?: string }> = {
  editorial: { label: "Editorial", blurb: "Warm paper cards and serif headlines" },
  kinetic: { label: "Kinetic type", blurb: "Giant type straight on a dark frame" },
  product: { label: "Product UI", blurb: "App-window panels with a mono header" },
  listing: { label: "Listing", blurb: "Quiet luxury, big numbers, gold accents" },
  terminal: { label: "Terminal", blurb: "Code windows and monospace on near-black" },
  boardroom: { label: "Boardroom", blurb: "Restrained navy and white, KPI tiles" },
  auto: { label: "Choose for me", blurb: "Picks the style that suits what you said", family: "auto" },
  typography: { label: "Kinetic typography", blurb: "Giant words that snap, stretch and wipe on the beat", family: "typography" },
  productui: { label: "Product UI", blurb: "App windows, a clicking cursor and spring motion", family: "productui" },
  explainer: { label: "Explainer", blurb: "Axes draw on, numbers count up, labels follow", family: "explainer" },
  generative: { label: "Generative neon", blurb: "Particles and glowing geometry on dark", family: "generative" },
  handdrawn: { label: "Hand-drawn", blurb: "Marker lines and doodles on paper", family: "handdrawn" },
  cartoon: { label: "Flat cartoon", blurb: "Bold outlines, bright colour, squash and stretch", family: "cartoon" },
  pixel: { label: "Pixel art", blurb: "Chunky sprites and stepped, game-like motion", family: "pixel" },
  retro: { label: "Retro terminal", blurb: "Green phosphor, scanlines and typed text", family: "retro" },
  collage: { label: "Paper collage", blurb: "Cut-out paper moving in stop-motion", family: "collage" },
  lowpoly: { label: "Low-poly", blurb: "Faceted pastel shapes that pop in", family: "lowpoly" },
  cinematic3d: { label: "Cinematic 3D", blurb: "Depth, light sweeps and slow camera moves", family: "cinematic3d" },
  photoreal: { label: "Film look", blurb: "Footage first, grain, warm light, restrained type", family: "photoreal" },
};

export const PLAYBOOKS: Playbook[] = [
  {
    id: "real_estate",
    label: "Real estate",
    tagline: "Market updates, listing tours and buyer advice that bring in local leads.",
    demo: {
      niche: "residential real estate in Austin, Texas",
      offer: "A local agent who helps first-time buyers win in a tight market without overpaying.",
      icp: "First-time home buyers and move-up sellers in Austin, Texas",
    },
    topic: "Austin housing market first time home buyers",
    formats: [
      { name: "Market update", pattern: "Hook with the one number that moved. Two facts behind it. What it means for buyers or sellers. Ask them to message you." },
      { name: "Listing walkthrough", pattern: "Hook with the best feature. Price, beds, baths, square feet. One detail photos miss. Invite a showing." },
      { name: "Neighborhood spotlight", pattern: "Hook with a surprising local fact. Three reasons people love it. Who it suits. Offer a short list of homes." },
      { name: "Buyer mistake", pattern: "Hook with the mistake. Why it costs money. The fix. Offer a free checklist." },
    ],
    hooks: ["Homes here just sold for {number} over asking.", "Do not make an offer until you check this.", "This is what {price} buys you in {area}."],
    scenes: ["facts", "stat", "list", "tip", "cta"],
    themes: ["listing", "editorial", "kinetic"],
  },
  {
    id: "developers",
    label: "Software developers",
    tagline: "Build-in-60-seconds clips, refactors and tool teardowns that earn follows.",
    demo: {
      niche: "software engineering and developer tools",
      offer: "An open source TypeScript toolkit that makes background jobs and queues easy to reason about.",
      icp: "Backend and full-stack engineers building SaaS products",
    },
    topic: "developer tools typescript ai coding agents",
    formats: [
      { name: "Build in 60 seconds", pattern: "Hook with what you will build. Show the code in three steps. Show the result. Point to the repo." },
      { name: "Before and after", pattern: "Hook with the ugly version. Show the refactor. Say what got faster or simpler. Ask what to refactor next." },
      { name: "Tool teardown", pattern: "Hook with the claim. Three things it does well, one it does badly. Who should use it." },
      { name: "Bug story", pattern: "Hook with the symptom. The wrong guess. The real cause. The one-line fix." },
    ],
    hooks: ["I deleted 400 lines and the tests got faster.", "Stop doing this in {tool}.", "Here is the {thing} I wish I had learned years ago."],
    scenes: ["code", "compare", "list", "stat", "tip"],
    themes: ["terminal", "product", "kinetic"],
  },
  {
    id: "product_marketing",
    label: "Product marketer",
    tagline: "Launch videos, positioning teardowns and before-and-after proof.",
    demo: {
      niche: "product marketing and positioning for B2B software",
      offer: "A positioning and launch playbook for product marketers at growth-stage software companies.",
      icp: "Product marketing managers and heads of product marketing",
    },
    topic: "product marketing positioning launch messaging",
    formats: [
      { name: "Feature launch", pattern: "Hook with the customer problem. The old way against the new way. One proof point. Where to try it." },
      { name: "Positioning teardown", pattern: "Hook with a famous brand's line. Why it works. The structure you can copy. A test to run this week." },
      { name: "Messaging test", pattern: "Hook with the result. The two variants. Why one won. What to change on your page." },
      { name: "Customer story", pattern: "Hook with the outcome. Before. What changed. The quote. Invite similar teams." },
    ],
    hooks: ["Your homepage says {phrase}. Your buyer hears {phrase2}.", "We changed one line and conversions moved {number}.", "Most launches fail at the same step."],
    scenes: ["compare", "stat", "list", "quote", "cta"],
    themes: ["product", "kinetic", "editorial"],
  },
  {
    id: "gtm",
    label: "GTM executives",
    tagline: "Pipeline lessons, signal plays and metric breakdowns for revenue leaders.",
    demo: {
      niche: "B2B outbound and video prospecting",
      offer: "Clearpath helps RevOps teams turn account signals into short personal video notes that get replies.",
      icp: "Heads of sales, revenue operations and growth at B2B software companies",
    },
    topic: "B2B outbound sales signals pipeline",
    formats: [
      { name: "Signal play", pattern: "Hook with the signal. Why it predicts buying. The exact first line to send. The result you saw." },
      { name: "Metric breakdown", pattern: "Hook with the metric. What moved it. The mistake that hides it. What to measure instead." },
      { name: "Outbound teardown", pattern: "Hook with a real cold email problem. Fix it in three edits. Show the after. Ask for the next teardown." },
      { name: "Pipeline lesson", pattern: "Hook with the lesson. The story in two beats. The rule. One action for Monday." },
    ],
    hooks: ["We booked {number} meetings from {number2} notes.", "Your reply rate is not a copy problem.", "Stop prospecting from lists."],
    scenes: ["stat", "list", "compare", "facts", "cta"],
    themes: ["product", "kinetic", "boardroom"],
  },
  {
    id: "c_suite",
    label: "C-suite executives",
    tagline: "Short point-of-view videos that build trust with customers, candidates and investors.",
    demo: {
      niche: "executive leadership and company strategy",
      offer: "A CEO sharing plain-spoken views on building a durable software company in the AI era.",
      icp: "Customers, candidates, board members and investors",
    },
    topic: "CEO leadership strategy AI company building",
    formats: [
      { name: "Point of view", pattern: "Hook with the position. The reason in two lines. What you are doing about it. Invite disagreement." },
      { name: "Quarterly note", pattern: "Hook with the headline result. Three numbers. The one thing you got wrong. What is next." },
      { name: "Decision story", pattern: "Hook with the decision. The options. Why you chose. What you would change." },
      { name: "Hiring principle", pattern: "Hook with the principle. A short example. How you test for it. The role you are hiring for." },
    ],
    hooks: ["Here is what I got wrong this quarter.", "We turned down {thing}. This is why.", "Most strategy decks miss {point}."],
    scenes: ["quote", "facts", "stat", "tip", "cta"],
    themes: ["boardroom", "editorial", "kinetic"],
  },
  {
    id: "founders",
    label: "Founders",
    tagline: "Build-in-public stories, metric reveals and lessons that grow a personal brand.",
    demo: {
      niche: "startup founding and building in public",
      offer: "A solo founder building a B2B product in public and sharing the real numbers.",
      icp: "Other founders, early customers and future hires",
    },
    topic: "startup founder build in public lessons fundraising",
    formats: [
      { name: "Metrics reveal", pattern: "Hook with the number. How you got it. What surprised you. What is next." },
      { name: "Lesson learned", pattern: "Hook with the mistake. What it cost. The rule you follow now. One question for founders." },
      { name: "Founder story", pattern: "Hook with the moment it almost ended. What you did. What changed. The lesson." },
      { name: "Build in public", pattern: "Hook with what shipped. Why. One screenshot-worthy detail. Ask for feedback." },
    ],
    hooks: ["We hit {number} in {time} with no ads.", "I nearly shut the company down in {month}.", "The best advice I ignored."],
    scenes: ["quote", "stat", "tip", "list", "cta"],
    themes: ["editorial", "kinetic", "product"],
  },
  {
    id: "general",
    label: "General",
    tagline: "Anything else. Uses your own niche, offer and audience from the Brain.",
    demo: { niche: "", offer: "", icp: "" },
    topic: "",
    formats: [
      { name: "Hot take", pattern: "Hook with the claim. Two reasons. One example. Ask for a reaction." },
      { name: "How to", pattern: "Hook with the outcome. Three steps. One common mistake. Point to the next step." },
      { name: "Story", pattern: "Hook with the turning point. What happened. What you learned. The takeaway." },
      { name: "List", pattern: "Hook with the count. Items with one line each. The one that matters most. Ask which they use." },
    ],
    hooks: ["Nobody tells you this about {topic}.", "Stop doing {thing}.", "Here is what actually works."],
    scenes: ["hook", "stat", "list", "quote", "tip", "cta"],
    themes: ["editorial", "kinetic", "product"],
  },
];

const byId = new Map(PLAYBOOKS.map((p) => [p.id, p]));

export function playbook(id: string | null | undefined): Playbook {
  return byId.get((id ?? "general") as UseCaseId) ?? byId.get("general")!;
}

export function isUseCase(id: string | null | undefined): id is UseCaseId {
  return !!id && byId.has(id as UseCaseId);
}

// The profile that drives research and writing. The demo workspace swaps profiles per tab so
// each use case reads true; a real workspace always uses what its owner wrote.
export function profileFor(ws: { niche: string; offer: string; icp: string; is_demo?: boolean }, id: UseCaseId) {
  const pb = playbook(id);
  if (ws.is_demo && id !== "general") return { ...pb.demo, topic: pb.topic };
  return { niche: ws.niche, offer: ws.offer, icp: ws.icp, topic: ws.niche || pb.topic };
}
