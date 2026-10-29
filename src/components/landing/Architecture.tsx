// How the pieces connect. Drawn by hand so it follows the light and dark tokens; the lines are animated by LandingMotion.
const PROVIDERS: [string, string][] = [
  ["OpenRouter", "writer models"],
  ["TypeSafe Jev", "picks, scores, filters"],
  ["Firecrawl", "search and page reading"],
  ["Apify", "LinkedIn, Instagram, TikTok, YouTube"],
  ["Cartesia", "speech to text, word timing"],
  ["Resend", "email"],
  ["Upload-Post", "posting to up to 15 platforms"],
];

export default function Architecture() {
  return (
    <svg viewBox="0 0 1000 660" role="img" aria-labelledby="arch-t arch-d">
      <title id="arch-t">Verbalore architecture</title>
      <desc id="arch-d">
        A browser or phone talks to a Next.js web app on Vercel. The web app and a Railway worker share one Supabase project, which holds the
        database, storage and a job queue. The worker runs research, signals, publishing and rendering, calling providers and reading public
        sources.
      </desc>
      <defs>
        <marker id="ar-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L10 5 L0 10 z" className="ar-head" />
        </marker>
      </defs>

      {/* flows */}
      <g>
        <path className="lp-flow" d="M240 68 H330" markerEnd="url(#ar-arrow)" />
        <path className="lp-flow" d="M130 116 V291 H330" markerEnd="url(#ar-arrow)" />
        <path className="lp-flow" d="M465 136 V214" markerStart="url(#ar-arrow)" markerEnd="url(#ar-arrow)" />
        <path className="lp-flow" d="M465 366 V444" markerStart="url(#ar-arrow)" markerEnd="url(#ar-arrow)" />
        <path className="lp-flow" d="M270 541 H328" markerEnd="url(#ar-arrow)" />
        <path className="lp-flow" d="M600 541 H698" markerEnd="url(#ar-arrow)" />
      </g>
      <text className="ar-label" x="248" y="58">browse</text>
      <text className="ar-label" x="140" y="212">signed upload</text>
      <text className="ar-label" x="478" y="182">queue jobs</text>
      <text className="ar-label" x="478" y="410">claim jobs</text>
      <text className="ar-label" x="606" y="531">calls</text>
      <text className="ar-label" x="274" y="531">reads</text>

      {/* you */}
      <g data-node>
        <rect className="ar-acc" x="20" y="20" width="220" height="96" rx="16" />
        <text className="ar-title" x="38" y="52">You</text>
        <text className="ar-text" x="38" y="76">Browser, or a phone</text>
        <text className="ar-text" x="38" y="96">scanning the QR code</text>
      </g>

      {/* web app */}
      <g data-node>
        <rect className="ar-box" x="330" y="20" width="270" height="116" rx="16" />
        <text className="ar-title" x="348" y="50">Web app on Vercel</text>
        <text className="ar-text" x="348" y="76">Next.js pages and server actions</text>
        <text className="ar-text" x="348" y="96">Signed upload URLs</text>
        <text className="ar-text" x="348" y="116">Daily cron: ideas and digest</text>
      </g>

      {/* supabase */}
      <g data-node>
        <rect className="ar-box" x="330" y="216" width="270" height="150" rx="16" />
        <text className="ar-title" x="348" y="246">Supabase</text>
        <text className="ar-text" x="348" y="272">Postgres, row level security, pgvector</text>
        <text className="ar-text" x="348" y="294">Auth</text>
        <text className="ar-text" x="348" y="316">Storage: recordings and finished videos</text>
        <text className="ar-text" x="348" y="338">vl_jobs queue, claimed with SKIP LOCKED</text>
      </g>

      {/* worker */}
      <g data-node>
        <rect className="ar-box" x="330" y="446" width="270" height="190" rx="16" />
        <text className="ar-title" x="348" y="476">Worker on Railway</text>
        <rect className="ar-lane" x="346" y="490" width="238" height="64" rx="10" />
        <text className="ar-name" x="360" y="514">Lane 1</text>
        <text className="ar-text" x="360" y="534">research, signals, publishing</text>
        <rect className="ar-lane" x="346" y="564" width="238" height="60" rx="10" />
        <text className="ar-name" x="360" y="586">Lane 2: render</text>
        <text className="ar-text" x="360" y="606">HyperFrames and ffmpeg in Chrome</text>
      </g>

      {/* sources */}
      <g data-node>
        <rect className="ar-acc" x="20" y="446" width="250" height="190" rx="16" />
        <text className="ar-title" x="38" y="476">Where it looks</text>
        <text className="ar-text" x="38" y="506">Reddit, Hacker News</text>
        <text className="ar-text" x="38" y="528">YouTube, TikTok, Instagram</text>
        <text className="ar-text" x="38" y="550">LinkedIn, Facebook</text>
        <text className="ar-text" x="38" y="572">SEC filings, ATS job boards</text>
        <text className="ar-text" x="38" y="594">GitHub, city permit records</text>
      </g>

      {/* providers */}
      <g data-node>
        <rect className="ar-box" x="700" y="20" width="280" height="616" rx="16" />
        <text className="ar-title" x="720" y="52">Providers</text>
        {PROVIDERS.map(([name, role], i) => (
          <g key={name}>
            <rect className="ar-lane" x="716" y={68 + i * 79} width="248" height="68" rx="10" />
            <text className="ar-name" x="732" y={95 + i * 79}>{name}</text>
            <text className="ar-text" x="732" y={117 + i * 79}>{role}</text>
          </g>
        ))}
      </g>
    </svg>
  );
}
