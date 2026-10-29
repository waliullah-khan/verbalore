import AutoRefresh from "@/components/AutoRefresh";
import JobNotice from "@/components/JobNotice";
import { activeJobs } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { SOURCE_LABEL, isPrimary, type Source } from "@/lib/signals/sources/types";
import Link from "next/link";
import { addContact, addOrganizations, addPlace, addWatch, ideaFromSignal, createNote, dismiss, removeOrganization, removeWatch, scan, scanOne } from "./actions";

const KIND: Record<string, string> = { funding: "Funding", leadership: "Leadership", launch: "Launch", hiring: "Hiring", custom: "Watching", filing: "Filing", change: "Site change", permit: "Permit", market: "Market" };

type Row = {
  id: string; kind: string; source: Source; headline: string; summary: string; evidence_url: string | null; detected_at: string;
  relevance: number; urgency: number; status: string; meta: { builder?: string } | null;
  account: { id: string; name: string; domain: string | null; stage: string | null; source: string };
};

const ago = (iso: string | null) => {
  if (!iso) return "not scanned yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 2 ? "just now" : m < 90 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago`;
};

export default async function Signals({ searchParams }: { searchParams: { added?: string; skipped?: string; org?: string; src?: string; only?: string } }) {
  const { db, ws } = await currentWorkspace();
  const [{ data: signals }, { data: contacts }, { data: accounts }, { data: watches }, running] = await Promise.all([
    db.from("vl_signals").select("*, account:vl_crm_accounts(id,name,domain,stage,source)").eq("workspace_id", ws.id).neq("status", "dismissed"),
    db.from("vl_crm_contacts").select("id,name,title,account_id").eq("workspace_id", ws.id),
    db.from("vl_crm_accounts").select("id,name,domain,source,last_scanned_at,meta").eq("workspace_id", ws.id).order("name"),
    db.from("vl_signal_watches").select("id,phrase").eq("workspace_id", ws.id),
    activeJobs(db, ws.id, ["scan_signals"]),
  ]);

  const rows = ((signals ?? []) as Row[]).sort((a, b) => b.relevance * b.urgency - a.relevance * a.urgency);
  const countFor = (id: string) => rows.filter((r) => r.account.id === id && r.status !== "sample").length;

  // filter by where a signal was found, and by organization
  const src = searchParams.src === "primary" || searchParams.src === "news" ? searchParams.src : "all";
  const only = (accounts ?? []).find((a) => a.id === searchParams.only);
  const inScope = rows.filter((r) => !only || r.account.id === only.id);
  const shown = inScope.filter((r) => (src === "primary" ? isPrimary(r.source) : src === "news" ? !isPrimary(r.source) : true));
  const nPrimary = inScope.filter((r) => isPrimary(r.source)).length;
  const href = (s: string) => `/signals?${new URLSearchParams({ ...(s !== "all" ? { src: s } : {}), ...(only ? { only: only.id } : {}) })}`;

  return (
    <div>
      <AutoRefresh active={running.length > 0} />
      <JobNotice kinds={["scan_signals"]} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Account-based</p>
          <h1 className="mt-1 text-4xl">Signals</h1>
          <p className="muted mt-2 max-w-xl">
            Changes at the {accounts?.length ?? 0} organizations you watch that are worth a personal video note. Beyond the news, Verbalore reads SEC filings, job boards, company sites and GitHub directly, so it can see a change before it is written up or posted.
          </p>
        </div>
        <form action={scan}>
          <button className="btn btn-primary" disabled={running.length > 0}>{running.length ? "Scanning…" : "Scan all"}</button>
        </form>
      </div>

      <section className="card mt-6">
        <p className="eyebrow">Watch an organization</p>
        <form action={addOrganizations} className="mt-3 space-y-3">
          <textarea
            name="orgs"
            rows={3}
            required
            className="lf"
            placeholder={"One per line. A name is enough, a website helps.\nRamp, ramp.com\nLinear\nhttps://attio.com"}
          />
          <details className="text-sm">
            <summary className="muted cursor-pointer">Add a contact (when watching one organization)</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-3">
              <input name="contact_name" placeholder="Name" className="lf" />
              <input name="contact_title" placeholder="Title" className="lf" />
              <input name="contact_email" type="email" placeholder="Email" className="lf" />
            </div>
          </details>
          <div className="flex flex-wrap items-center gap-3">
            <button className="btn btn-primary">Watch and scan</button>
            <span className="muted text-xs">Up to 25 at a time. It scans straight away.</span>
          </div>
        </form>
        {searchParams.added !== undefined && (
          <p className="mt-3 text-sm" style={{ color: "var(--ok)" }}>
            {searchParams.added === "0"
              ? "Already on your list, so nothing new was added."
              : `Now watching ${searchParams.added} new organization${searchParams.added === "1" ? "" : "s"}${
                  Number(searchParams.skipped) > 0 ? `, ${searchParams.skipped} already on the list` : ""
                }. The first scan is running.`}
          </p>
        )}
        {searchParams.org === "limit" && <p className="mt-3 text-sm" style={{ color: "var(--warn)" }}>The public demo has reached its hourly limit for this action. Try again in a while.</p>}
        {searchParams.org === "empty" && <p className="mt-3 text-sm" style={{ color: "var(--warn)" }}>Type at least one organization name.</p>}

        <form action={addPlace} className="mt-5 flex flex-wrap items-center gap-3 rounded-xl p-3" style={{ background: "var(--paper-2)" }}>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-medium">Watch a place</p>
            <p className="muted text-xs">Reads the city&apos;s own records: new-home permits, teardowns, large projects and the builders behind them. Updated daily.</p>
          </div>
          <select name="city" className="lf w-auto" aria-label="City">
            <option value="austin">Austin, TX</option>
          </select>
          <button className="btn btn-ghost">Watch</button>
        </form>

        <ul className="mt-5 divide-y" style={{ borderColor: "var(--line)" }}>
          {(accounts ?? []).map((a) => {
            const board = (a.meta as { jobBoard?: { provider: string } } | null)?.jobBoard;
            return (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <span className="font-medium">{a.name}</span>
                  {a.source === "place" ? <span className="muted"> · city permit records</span> : a.domain ? <span className="muted"> · {a.domain}</span> : <span className="muted"> · no website found</span>}
                  <p className="muted text-xs">
                    {a.source === "manual" ? "Added by you" : a.source === "place" ? "Place" : "Sample CRM"} · scanned {ago(a.last_scanned_at)}
                    {board && ` · job board: ${board.provider}`}
                  </p>
                  <details className="group mt-1">
                    <summary className="cursor-pointer text-xs font-bold underline underline-offset-2">{countFor(a.id)} signal{countFor(a.id) === 1 ? "" : "s"}</summary>
                    <ul className="mt-2 grid gap-2">
                      {rows.filter((r) => r.account.id === a.id && r.status !== "sample").slice(0, 12).map((r) => (
                        <li key={r.id} className="rounded-xl border p-3" style={{ borderColor: "var(--line)", background: "var(--paper)" }}>
                          <span className="chip">{SOURCE_LABEL[r.source] ?? r.source}</span>
                          <p className="mt-1 font-bold">{r.headline}</p>
                          {r.summary && <p className="muted text-xs">{r.summary}</p>}
                          {r.evidence_url && <a href={r.evidence_url} target="_blank" rel="noopener noreferrer" className="text-xs font-bold underline underline-offset-2">See the source</a>}
                        </li>
                      ))}
                      {countFor(a.id) === 0 && <li className="muted text-xs">Nothing found yet. Press Scan.</li>}
                    </ul>
                  </details>
                </div>
                <form action={scanOne}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="btn btn-ghost !px-3 !py-1.5" disabled={running.length > 0}>Scan</button>
                </form>
                <form action={removeOrganization}>
                  <input type="hidden" name="id" value={a.id} />
                  <button className="muted text-xs underline-offset-4 hover:underline" aria-label={`Stop watching ${a.name}`}>Stop watching</button>
                </form>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="card mt-4">
        <p className="eyebrow">Watch for something specific</p>
        <form action={addWatch} className="mt-3 flex flex-wrap gap-2">
          <input name="phrase" placeholder="e.g. opened a new office, raised a seed round" className="lf min-w-0 flex-1" />
          <button className="btn btn-ghost">Add</button>
        </form>
        {!!watches?.length && (
          <div className="mt-3 flex flex-wrap gap-2">
            {watches.map((w) => (
              <form key={w.id} action={removeWatch} className="chip gap-2">
                {w.phrase}
                <input type="hidden" name="id" value={w.id} />
                <button aria-label={`Stop watching ${w.phrase}`} className="opacity-60 hover:opacity-100">×</button>
              </form>
            ))}
          </div>
        )}
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-2" role="tablist" aria-label="Filter signals">
        {([["all", `All (${inScope.length})`], ["primary", `Found at the source (${nPrimary})`], ["news", `News (${inScope.length - nPrimary})`]] as const).map(([k, label]) => (
          <Link key={k} href={href(k)} role="tab" aria-selected={src === k} className={`rounded-full px-4 py-2 text-sm transition ${src === k ? "bg-[var(--ink)] text-[var(--paper)]" : "hover:bg-[var(--paper-2)]"}`}>{label}</Link>
        ))}
        {only && (
          <span className="chip gap-2">
            {only.name}
            <Link href={src === "all" ? "/signals" : `/signals?src=${src}`} aria-label="Show all organizations" className="opacity-60 hover:opacity-100">×</Link>
          </span>
        )}
      </div>

      <div className="mt-4 grid gap-4">
        {shown.map((s) => {
          const people = (contacts ?? []).filter((c) => c.account_id === s.account.id);
          const primary = isPrimary(s.source);
          return (
            <article key={s.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{KIND[s.kind] ?? s.kind}</span>
                <span className="display text-lg">{s.account.name}</span>
                {s.account.stage && <span className="muted text-sm">{s.account.stage}</span>}
                <span className="chip" title={primary ? "Read directly from the source, not from a news story" : "Reported in the news"}>{SOURCE_LABEL[s.source] ?? s.source}</span>
                {primary && <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--ok)" }}>found at the source</span>}
                {s.status === "sample" && <span className="chip">sample</span>}
                <span className="chip ml-auto">fit {Math.round(s.relevance * 100)} · urgency {Math.round(s.urgency * 100)}</span>
              </div>
              <h2 className="mt-3 text-xl leading-snug">{s.headline}</h2>
              {s.summary && <p className="muted mt-1 text-sm">{s.summary}</p>}
              <p className="muted mt-2 text-xs">
                {new Date(s.detected_at).toLocaleDateString()}
                {s.evidence_url && !s.evidence_url.includes("example.com") && (
                  <> · <a href={s.evidence_url} target="_blank" rel="noreferrer" className="underline underline-offset-2">source</a></>
                )}
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-2">
                {s.account.source === "place" ? (
                  <>
                    <form action={ideaFromSignal}>
                      <input type="hidden" name="signal" value={s.id} />
                      <button className="btn btn-primary">Make a video from this</button>
                    </form>
                    {s.meta?.builder && (
                      <form action={addOrganizations}>
                        <input type="hidden" name="orgs" value={s.meta.builder} />
                        <button className="btn btn-ghost">Watch {s.meta.builder}</button>
                      </form>
                    )}
                  </>
                ) : people.length > 0 ? (
                  <form action={createNote} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="signal" value={s.id} />
                    <select name="contact" className="lf w-auto">
                      {people.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.title}</option>)}
                    </select>
                    <button className="btn btn-primary">Make a video note</button>
                  </form>
                ) : (
                  <details className="w-full text-sm">
                    <summary className="muted cursor-pointer">No contact yet. Add one to send a video note.</summary>
                    <form action={addContact} className="mt-2 grid gap-2 sm:grid-cols-4">
                      <input type="hidden" name="account" value={s.account.id} />
                      <input name="name" required placeholder="Name" className="lf" />
                      <input name="title" placeholder="Title" className="lf" />
                      <input name="email" type="email" placeholder="Email" className="lf" />
                      <button className="btn btn-ghost">Add contact</button>
                    </form>
                  </details>
                )}
                <form action={dismiss}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn btn-ghost">Dismiss</button>
                </form>
              </div>
            </article>
          );
        })}
        {!shown.length && (
          <div className="card text-center">
            <p className="display text-xl">No signals yet</p>
            <p className="muted mt-1 text-sm">{rows.length ? "Nothing matches this filter." : "Add an organization above, or press “Scan all”."}</p>
          </div>
        )}
      </div>
    </div>
  );
}
