import type { Metadata } from "next";
import Link from "next/link";
import "./landing.css";
import Shot from "@/components/landing/Shot";
import Showreel from "@/components/landing/Showreel";
import Architecture from "@/components/landing/Architecture";
import StyleGrid from "@/components/landing/StyleGrid";
import LandingMotion from "@/components/landing/LandingMotion";
import { landingVideos } from "@/lib/landing-videos";

const TITLE = "Verbalore: show up on camera every day";
const DESCRIPTION =
  "Verbalore reads what your market is posting, writes the script, prompts you while you record, edits the video and posts it. A signals engine turns buying signals into personal video notes.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  openGraph: { title: TITLE, description: DESCRIPTION, images: [{ url: "/landing/og.jpg", width: 1200, height: 630 }], type: "website" },
  twitter: { card: "summary_large_image", title: TITLE, description: DESCRIPTION, images: ["/landing/og.jpg"] },
};

const LOOP = [
  {
    n: "1",
    title: "Ideas",
    shot: "today-wide",
    alt: "The Today screen: ranked video ideas with their sources",
    body: "Every morning the daily research loop reads what people are posting on Reddit, Hacker News, YouTube, TikTok, Instagram, LinkedIn and Facebook. You get ranked ideas, each with its evidence and a real example to learn from.",
  },
  {
    n: "2",
    title: "Record",
    shot: "record-wide",
    alt: "The Record screen: camera frame with the script scrolling on a teleprompter",
    body: "The script scrolls on a teleprompter while you record in the browser. Or scan a QR code, record on your phone, and the take lands on your desktop ready to edit.",
  },
  {
    n: "3",
    title: "Edit",
    shot: "edit-wide",
    alt: "The Edit screen: the rendered video, scene editor and timeline",
    body: "Speech to text gives word-level timing, the planner cuts the talk into scenes, and the render worker produces a vertical video with captions and a graphic on every scene. Change any scene, or pick another look.",
  },
  {
    n: "4",
    title: "Post",
    shot: "library-wide",
    alt: "The Library: finished videos with their status and actions",
    body: "Review a caption per platform and post to up to 15 platforms, or send the video to one person as a private link. Finished videos wait in your Library.",
  },
];

const HOW = [
  {
    tag: "01",
    title: "The daily research loop",
    body: "Collectors for each platform run in parallel, Firecrawl first and Apify where it falls short. Posts are scored against their own platform's engagement, de-duplicated and balanced, then filtered for relevance to your niche. The writer drafts only from what those sources say.",
  },
  {
    tag: "02",
    title: "Jev decides",
    body: "TypeSafe's Jev is a small decision model that returns typed answers: it picks the most relevant example from a set of posts, scores ideas, and says whether a signal is real or noise. Writing stays with the larger models on OpenRouter.",
  },
  {
    tag: "03",
    title: "One queue, two lanes",
    body: "The web app writes jobs into a Postgres table. The worker claims them with SKIP LOCKED, so two workers never take the same job. Research, signals and publishing run in one lane and rendering in another, so a long render never blocks a scan.",
  },
  {
    tag: "04",
    title: "Phone capture without an app",
    body: "A QR code opens a short-lived page on your phone, with no login. The phone uploads straight to storage with a signed URL, never through the server, and the take appears on your desktop. The link expires after two hours.",
  },
  {
    tag: "05",
    title: "Signals before social",
    body: "The signals engine reads primary sources directly: SEC filings, job boards through their public APIs, site changes, GitHub, and city permit records. Each signal is labelled when it was found at the source, filtered for noise, and can become a 30 second video note for a contact.",
  },
  {
    tag: "06",
    title: "Guards on cost and abuse",
    body: "Every workspace has a daily allowance of background runs. New accounts need approval. The demo never sends email and never posts to a real account, and the Brain only fetches public web pages.",
  },
];

const USE_CASES = ["Real estate", "Software developers", "Product marketer", "GTM executives", "C-suite executives", "Founders", "General"];

function Cta({ className = "" }: { className?: string }) {
  return (
    <div className={`lp-cta ${className}`}>
      <Link href="/demo" className="btn primary lg">Interact with the demo</Link>
      <Link href="/login?mode=signup" className="btn quiet lg">Sign up</Link>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="lp">
      <LandingMotion />

      <header className="lp-nav">
        <div className="lp-nav-in">
          <Link href="/" className="lp-brand">Verbalore</Link>
          <nav className="lp-links" aria-label="Sections">
            <a href="#loop">The loop</a>
            <a href="#showreel">Showreel</a>
            <a href="#architecture">Architecture</a>
            <a href="#styles">Styles</a>
            <a href="#honest">What is real</a>
          </nav>
          <div className="lp-nav-actions">
            <Link href="/login?mode=signup" className="btn quiet">Sign up</Link>
            <Link href="/demo" className="btn primary">Interact with the demo</Link>
          </div>
        </div>
      </header>

      <main>
        <section className="lp-hero">
          <div>
            <span className="lp-eyebrow" data-rise>Video, without the blank page</span>
            <h1 data-rise>Show up on camera <em>every day.</em> We do the rest.</h1>
            <p className="lp-lede" data-rise>
              Verbalore reads what your market is posting, drafts a script from those sources, prompts you while you record, edits the video
              automatically and posts it. A signals engine watches accounts and turns a hire, a filing or a permit into a personal video note.
            </p>
            <div data-rise><Cta /></div>
            <div className="lp-pills" data-rise>
              <span className="lp-pill"><b>7</b> use cases</span>
              <span className="lp-pill"><b>12</b> style families</span>
              <span className="lp-pill"><b>425</b> style prompts</span>
              <span className="lp-pill"><b>15</b> platforms</span>
            </div>
          </div>

          <div className="lp-stage" data-rise>
            <div className="lp-glow" aria-hidden="true" />
            <div className="lp-win" data-float>
              <div className="lp-win-bar"><i /><i /><i /><span>verbalore / home</span></div>
              <Shot name="home-wide" alt="The Verbalore home screen: a pixel studio lot where every building is a part of the app" w={1280} h={800} eager />
            </div>
            <div className="lp-phone lp-hero-phone">
              <Shot name="today-phone" alt="The Today screen on a phone" w={780} h={1688} eager />
            </div>
          </div>
        </section>

        <section id="loop" className="lp-sect">
          <span className="lp-eyebrow" data-rise>The loop</span>
          <h2 className="lp-h2" data-rise>Four steps, about ten minutes.</h2>
          <p className="lp-lede" data-rise>One clear job per screen. These are screenshots of the running app, not mock-ups.</p>
          <div className="lp-loop">
            {LOOP.map((s) => (
              <article key={s.n} className="card lp-step" data-rise>
                <div className="lp-win">
                  <div className="lp-win-bar"><i /><i /><i /><span>{s.title.toLowerCase()}</span></div>
                  <Shot name={s.shot} alt={s.alt} w={1280} h={800} />
                </div>
                <div className="lp-step-head">
                  <span className="lp-num">{s.n}</span>
                  <h3>{s.title}</h3>
                </div>
                <p>{s.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="showreel" className="lp-band">
          <div className="lp-in">
            <span className="lp-eyebrow" data-rise>Showreel</span>
            <h2 className="lp-h2" data-rise>Talking-head clips in. Edited videos out.</h2>
            <p className="lp-lede" data-rise>
              These were cut from raw clips by the render worker. They loop muted; tap Sound on to hear one.
            </p>
            <Showreel videos={landingVideos} />
          </div>
        </section>

        <section id="architecture" className="lp-sect">
          <span className="lp-eyebrow" data-rise>Architecture</span>
          <h2 className="lp-h2" data-rise>A web app, a database and a worker.</h2>
          <p className="lp-lede" data-rise>
            The web app never renders video. It queues work in Supabase, and a Railway worker with ffmpeg and headless Chrome picks it up.
          </p>
          <div className="card lp-arch" data-rise>
            <Architecture />
          </div>
          <p className="lp-hint">Swipe the diagram sideways to see all of it.</p>
          <ul className="lp-facts" aria-label="The diagram in words">
            <li><b>Web app (Vercel).</b> Next.js pages and server actions, signed upload URLs, and a daily cron that queues ideas and the digest.</li>
            <li><b>Supabase.</b> Postgres with row level security and pgvector, Auth, Storage for recordings and finished videos, and the job queue.</li>
            <li><b>Worker (Railway).</b> Two lanes: research, signals and publishing; and rendering with HyperFrames and ffmpeg in headless Chrome.</li>
            <li><b>Providers.</b> OpenRouter for writing, TypeSafe Jev for decisions, Firecrawl and Apify for research, Cartesia for speech to text, Resend for email, Upload-Post for publishing.</li>
            <li><b>Sources.</b> Reddit, Hacker News, YouTube, TikTok, Instagram, LinkedIn, Facebook, SEC filings, ATS job boards, GitHub and city permit records.</li>
            <li><b>Phone and browser.</b> Both upload recordings straight to storage with signed URLs, not through the server.</li>
          </ul>
          <div className="lp-how">
            {HOW.map((h) => (
              <article key={h.tag} className="card" data-rise>
                <span className="lp-tag">{h.tag}</span>
                <h3>{h.title}</h3>
                <p>{h.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="signals" className="lp-sect">
          <span className="lp-eyebrow" data-rise>Signals</span>
          <div className="lp-feature">
            <div data-rise>
              <h3>Reach out the day it matters.</h3>
              <p>
                Watch any organization, or a city. Verbalore reads the filing, the job board or the permit record itself and tells you what changed,
                with a link to the source. One click turns a signal into a script and a video note for the right contact.
              </p>
              <ul>
                <li>SEC filings, job boards, GitHub, site changes, news</li>
                <li>City permit records, wired for Austin, Texas</li>
                <li>Each signal says whether it was found at the source</li>
              </ul>
            </div>
            <div className="lp-win" data-rise>
              <div className="lp-win-bar"><i /><i /><i /><span>signals</span></div>
              <Shot name="signals-wide" alt="The Signals screen: signal cards with sources and a detail panel" w={1280} h={800} />
            </div>
          </div>
          <div className="lp-feature flip">
            <div data-rise>
              <h3>A streak worth keeping.</h3>
              <p>
                A streak ring, a level, badges and a weekly challenge that your real videos chip away at. Everything is counted from what you
                actually recorded and posted. Turn the game off, or up, from the Display menu.
              </p>
              <ul>
                <li>Streak, weekly goal, level and experience</li>
                <li>Badges with visible progress</li>
                <li>Off, a little, or the full game</li>
              </ul>
            </div>
            <div className="lp-win" data-rise>
              <div className="lp-win-bar"><i /><i /><i /><span>team</span></div>
              <Shot name="team-wide" alt="The Team screen: the weekly challenge, the arena and the squad" w={1280} h={800} />
            </div>
          </div>
        </section>

        <section id="styles" className="lp-sect">
          <span className="lp-eyebrow" data-rise>Style library</span>
          <h2 className="lp-h2" data-rise>425 prompts across 12 families.</h2>
          <p className="lp-lede" data-rise>
            Every video is edited in a visual family, each with its own palette, type, motion and transitions. This is the Verbalore style
            library the edits draw from.
          </p>
          <StyleGrid />
        </section>

        <section id="honest" className="lp-sect">
          <span className="lp-eyebrow" data-rise>What is real</span>
          <h2 className="lp-h2" data-rise>What the demo does, and what it does not.</h2>
          <div className="lp-two">
            <div className="card lp-real" data-rise>
              <h3>Real in the demo</h3>
              <ul>
                <li>Research from live posts across the platforms</li>
                <li>Signals from SEC filings, job boards, GitHub and Austin permit records</li>
                <li>Scripts written by the model from those sources</li>
                <li>Videos rendered by the worker from real clips</li>
              </ul>
            </div>
            <div className="card lp-sample" data-rise>
              <h3>Sample or switched off in the demo</h3>
              <ul>
                <li>The CRM contacts are sample people</li>
                <li>Posting is simulated; nothing reaches a real account</li>
                <li>Email is turned off</li>
              </ul>
            </div>
          </div>
          <div className="card lp-limits" data-rise>
            <h3>Seven use cases, and the limits</h3>
            <div className="lp-pills" style={{ marginTop: ".8rem" }}>
              {USE_CASES.map((u) => <span key={u} className="lp-pill">{u}</span>)}
            </div>
            <ul>
              <li>An early build. A few edit controls are visible but disabled until the renderer can honor them, and they say so on hover.</li>
              <li>Every workspace has a daily allowance of 12 background runs, to keep provider costs in check.</li>
              <li>Permit records are wired for Austin, Texas only.</li>
              <li>Bringing your own provider keys is not built yet.</li>
              <li>The league and squad tabs need a second team; with one workspace they show an empty state.</li>
            </ul>
          </div>
        </section>

        <section className="lp-final" data-rise>
          <span className="lp-eyebrow">Try it</span>
          <h2>The demo is open. Click around.</h2>
          <p className="lp-lede" style={{ marginTop: 0 }}>
            One click signs you in to a sample workspace with real research, real signals and finished videos. Want your own workspace? Ask for a seat.
          </p>
          <Cta />
        </section>
      </main>

      <footer className="lp-foot">
        <p>Built for a hackathon. The code is public at <a href="https://github.com/waliullah-khan/verbalore">github.com/waliullah-khan/verbalore</a>.</p>
      </footer>

      <div className="lp-sticky">
        <Link href="/demo" className="btn primary">Interact with the demo</Link>
        <Link href="/login?mode=signup" className="btn quiet">Sign up</Link>
      </div>
    </div>
  );
}
