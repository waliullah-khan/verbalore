# Verbalore

A daily video plan for people who know they should be on camera and never find the time.

Verbalore researches what your market is posting about, writes the script in your voice, prompts you while you record, and edits the video for you with a graphic on every scene. A second half of the product watches the accounts in your CRM and turns each buying signal into a personal video note.

| | |
|---|---|
| Track | _Antler Agents (fill in before submitting)_ |
| Demo video (Loom) | _add link_ |
| Deployed URL | _add link, or run it locally with the steps below_ |
| Team | _names, roles, contacts (up to 5)_ |

## What it does

1. **Ideas.** Seven use-case tabs (real estate, software developers, product marketers, GTM executives, C-suite, founders, general). Each pulls what people are posting in that niche from Reddit, Hacker News, YouTube, TikTok, Instagram, LinkedIn and Facebook, scores every post against others on its own platform, drops off-topic ones, and writes five ideas. Each idea shows its evidence, one reference post picked by Jev with its hook / body / ending broken down, and a script in your voice.
2. **Daily email.** A cron job queues the research each morning and a second one emails the five best ideas. Each has a button that opens the teleprompter.
3. **Studio.** Camera preview, scrolling teleprompter (speed, size, mirror, pause on space), retake as often as you like, direct upload to storage. You can also upload an existing video.
   **Record on your phone:** the Studio shows a QR code. Scan it and the phone opens a full-screen recorder with the same teleprompter, no sign-in needed. When you press send, the take uploads straight to storage and appears in the desktop Studio on its own, ready to edit. The link is single-purpose, expires after two hours, and can only upload into its own folder.
4. **Edit.** A worker normalises the take, gets word timings, cuts the transcript into scenes, and gives every scene a graphic: hook title, stat, list, quote, tip, code window, before/after, fact tiles, call to action. The scene plan is validated, so a scene can never ship without its graphic. Each use case offers its own edit themes (editorial, kinetic type, product UI, listing, terminal, boardroom).
5. **Library and posting.** Preview, re-edit in another style, and post to up to 15 platforms through Upload-Post, now or scheduled.
6. **Signals.** Watch any organization: add one, or paste a list of names and websites. For each one the engine reads the primary sources directly (SEC filings, the company's job board, its own website, GitHub) and also searches the news. Results are classified, de-duplicated, and ranked by fit and urgency, and each shows where it was found. You can also add a plain-language signal to watch ("opened a new office"). Pick a signal and a contact and it writes a 30 second note, you record it, and it goes out as a share page `/v/<token>` with view tracking.
7. **Brain.** Notes, posts and pages you add. Scripts are written only from this, and a voice profile (tone, sentence length, repeated phrases) is learned from your own writing. A document can apply to everything or to one use-case tab, so real-estate notes never leak into developer content.

## Where signals come from

| Source | What it reads | Why it can be early |
|---|---|---|
| SEC EDGAR | Form D (a private company reporting a raise), S-1, 8-K, matched on the filer's own name | A Form D is filed within days of the first sale, often before any announcement |
| Job boards | The company's Greenhouse, Ashby, Lever, Workable or Recruitee board, read through the public API, with the publish date of each role | The board is the source of truth and is updated before the careers page or LinkedIn. Roles missing from the careers page are flagged |
| Company website | Pricing page, homepage and blog, compared with the last scan | Changes appear on the site before they are written about |
| GitHub | New public repositories under the company's own organization | Engineering ships before marketing announces |
| News and social | Web search | Reported by someone else, so it is the slowest |

Each source fails on its own without taking the others down, and a signal is only ever created from something the source actually returned. Job boards are found by asking the applicant systems directly. A guessed board is accepted only when the system names the same company, or the company's own site links to it, because two companies can share a name.

## Quick start

Needs Node 22+, ffmpeg and ffprobe on your PATH, and Chrome (HyperFrames renders with it).

```bash
git clone <this repo> && cd verbalore
npm install
cp .env.example .env.local        # then fill it in, see below
# apply supabase/migrations/*.sql in order to a Supabase project
npx tsx --env-file=.env.local scripts/seed-demo.ts

npm run dev                       # the app on http://localhost:3000
npm run worker                    # in a second terminal: research, renders, posting
```

Open http://localhost:3000, press **Open the demo workspace**, and the seeded workspace loads.

Other commands: `npm test`, `npm run typecheck`, `npm run lint`, `npm run scan:secrets` (fails if a key or `.env` file is about to be committed), `npm run check:keys` (read-only check that each configured provider key is accepted; prints status codes, never values).

### Recording from a phone

A phone cannot open `localhost`, so the QR code points at your computer's address on the local network, and the phone must be on the same Wi-Fi (some campus and guest networks isolate devices and block this). Mobile browsers also only allow the live camera on `https`. Over plain `http` the phone page still works: it shows the script and opens the phone's own camera app to record, then uploads as usual. For the live teleprompter on a phone, use the deployed `https` URL, or set `PUBLIC_BASE_URL` to a tunnel address before opening the Studio.

## Reproduce the demo

Copy `.env.example` to `.env.local`. Only the Supabase values are required to boot. Every other provider has a fallback, and Settings shows which ones are connected.

| Variable | Used for | Without it |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Database, auth, storage | The app will not run |
| `DEMO_USER_EMAIL`, `DEMO_USER_PASSWORD` | The one-click demo and the worker's sign-in | No demo login |
| `CRON_SECRET` | Guards `/api/cron/*` | Cron routes return 401 |
| `OPENROUTER_API_KEY` | Writer model, scene planning | Scripts and scenes use deterministic templates |
| `TYPESAFE_API_KEY` | Jev: relevance filter, reference pick, signal classification | Keyword rules and highest engagement are used |
| `APIFY_TOKEN` | YouTube, TikTok, Instagram, LinkedIn, Reddit, Google search | Sample posts are shown, badged "sample" |
| `FIRECRAWL_API_KEY` | Web search and page reading | Apify or plain fetch is used |
| `CARTESIA_API_KEY` | Word-level timings from speech | Timings are spread across the take from the script |
| `RESEND_API_KEY`, `RESEND_FROM_EMAIL` | Digest and note emails | Sends are simulated and labelled as such |
| `UPLOAD_POST_API_KEY` | Posting to 15 platforms | Posting is simulated and labelled as such |
| `HUBSPOT_TOKEN` | Live CRM | The sample CRM is used |
| `SEC_USER_AGENT` | Identifies you to SEC EDGAR, which asks every client to | A generic agent is sent |
| `GITHUB_TOKEN` | Optional, raises GitHub's rate limit | 60 requests an hour |
| `SUPABASE_SERVICE_KEY` | Phone capture, cron and the worker run with full access | They sign in as the demo user instead, under row level security |
| `PUBLIC_BASE_URL` | The address the phone QR code points at | The computer's local network address is used |

The database uses the `vl_` table prefix, so it can share a Supabase project. Migrations are in `supabase/migrations`.

## Architecture

```mermaid
flowchart LR
  subgraph Web[Next.js app on Vercel]
    UI[Ideas / Studio / Library / Signals / Brain]
    Cron[/api/cron generate + digest/]
    Share[/v/token share page/]
  end
  subgraph DB[Supabase]
    PG[(Postgres + RLS)]
    ST[(Storage: recordings, videos)]
    Q[vl_jobs queue]
  end
  subgraph Worker[Node worker, local or Railway]
    L1[work lane: research, signals, posting]
    L2[render lane: ffmpeg + HyperFrames]
  end
  UI --> PG
  UI -- direct upload --> ST
  UI --> Q
  Cron --> Q
  Q --> L1
  Q --> L2
  L1 --> Apify & Firecrawl & Jev & LLM[OpenRouter] & UP[Upload-Post]
  L2 --> Cartesia
  L2 --> ST
  Share --> PG
```

- **Next.js 14** (app router, server actions), TypeScript strict, Tailwind.
- **Supabase** for Postgres with row level security on every table, auth, and storage. Recordings upload straight from the browser to storage, never through a server action.
- **A job table, not a workflow engine.** `vl_claim_job` hands out work with `FOR UPDATE SKIP LOCKED`. The worker has two lanes so a render never waits behind research.
- **HyperFrames** renders an HTML composition to MP4. A template is a function from a scene plan to HTML, so changing the words re-renders without redoing anything else.
- **Jev** (TypeSafe's decision model, called directly) does the small judgement calls: is this post relevant, which example fits this idea, what kind of signal is this. Its confidence is a ranking rather than a probability, so every call has a deterministic fallback.
- The research method follows the idea behind [last30days](https://github.com/mvanhorn/last30days-skill): query many sources in parallel, then score each post against the others on its own platform instead of comparing raw likes across networks. This is a small TypeScript version of the idea, not a port.

## How fast is it

Measured on a Ryzen 7 4800H laptop, 1080×1920 at 24 fps.

| Stage | 24 second clip |
|---|---|
| ffmpeg normalise | about 5 s |
| HyperFrames render | about 72 s alone, about 92 s with the dev server and worker running |
| Upload of the finished file | bound by the home connection (73 s for a 16 MB file here; the encode was then lowered to CRF 24 to shrink it) |

That is roughly 3 to 4 times real time for the render itself, so a 45 second video renders in roughly two and a quarter to three minutes on this laptop. A worker in the cloud removes the upload cost. The worker records every stage in `vl_videos.transcript.timings`.

## Data and where it came from

- `fixtures/crm.json`: **synthetic CRM**. The accounts are real public companies, so the signal engine can find real news about them. Every contact is invented and uses an `example.com` address. The app refuses to email an `example.com` address.
- `fixtures/demo-workspace.json`: Clearpath, a **fictional** company, and its brain documents, written for this project.
- `fixtures/research.json` and `fixtures/signals.json`: **synthetic** sample posts and signals, shown with a "sample" badge and used only when a live source is unavailable.
- Live research and signals come from the sources above at run time. Nothing scraped is stored in this repository.
- Edit themes and script formats were designed for this project. They were informed by [awesome-opus-5-5-video-styles](https://github.com/HiAPIAI/awesome-opus-5-5-video-styles) (CC BY 4.0) and by how [Poppy](https://getpoppy.ai) turns winning content into scripts. No prompts or text were copied from either.

## Known limitations

- Without Jev and the writer model, scripts are templates and signal results are noisier. The product is meant to run with both.
- Phone uploads go to Supabase storage, whose file size limit depends on the plan (50 MB on the free tier). The phone recorder uses 4 Mbps, which keeps about a minute of video under that. A video from the phone's own camera app can be larger.
- Public job-board APIs list only published roles, so roles that are truly unlisted cannot be seen. What is visible is the full published list with exact dates, which is more than the careers page shows. "On the board but not on the careers page" is only claimed when the careers page lists jobs in its HTML; pages that load jobs with JavaScript are skipped rather than guessed at.
- Not every company's board has a public API, and a company on an unsupported system returns no job signals.
- Site watching only reports changes from the second scan on, because the first scan sets the baseline. Page diffs are noisy (counters, timestamps, rotating examples), so lines pass a filter and then Jev decides whether it is a real change. Expect few site signals rather than many.
- The signal engine reads company data. Real estate has deeper public sources that are not built yet: building permits, recorded deeds and sales, and zoning changes from city and county open-data portals. Brokerages and REITs are already covered by the SEC source.
- Scripts quote numbers from the evidence they were built on. Check any figure against its linked source before you post it.
- Facebook has no open search, so it comes through web search and has no engagement counts.
- Captions follow the script's timing when no speech-to-text key is set, so they drift if you ad-lib. With Cartesia they follow the speech.
- The signal engine uses web search, so it finds what is published and indexed, not private changes. A LinkedIn-based signal would need a logged-in source.
- Rendering needs Chrome and ffmpeg, so it runs on the worker, not on Vercel. The Vercel app and the worker share one database.
- The Brain stores embeddings but writes from whole documents. Retrieval over chunks is the next step once the brain grows past a few pages.
- HubSpot and Clay are not wired yet. CRM data comes from the sample file.

## Next steps

HubSpot and Clay sync, Gmail and call-transcript sources for the Brain, an avatar or voice-over option for notes with no camera, hook A/B tests tied back to post analytics, and a render worker on Railway.

## Credits

[HyperFrames](https://hyperframes.heygen.com) for rendering, [Upload-Post](https://upload-post.com) for posting, [TypeSafe Jev](https://typesafe.ai) for decisions, [Apify](https://apify.com) and [Firecrawl](https://firecrawl.dev) for research, Supabase, Resend and Cartesia.
