import AutoRefresh from "@/components/AutoRefresh";
import JobNotice from "@/components/JobNotice";
import SignalsBoard, { type SigRow } from "@/components/studio/SignalsBoard";
import { activeJobs } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { SOURCE_LABEL, isPrimary, type Source } from "@/lib/signals/sources/types";
import { addOrganizations, addPlace, addWatch, removeOrganization, removeWatch, scanOne } from "./actions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const fetchCache = "force-no-store";

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

const note = (ok: boolean): React.CSSProperties => ({ marginTop: ".75rem", fontWeight: 700, color: ok ? "var(--ok)" : "var(--warn)" });

export default async function Signals({ searchParams }: { searchParams: { added?: string; skipped?: string; org?: string } }) {
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

  const board: SigRow[] = rows.map((s) => ({
    id: s.id,
    accountId: s.account.id,
    co: s.account.name,
    isPlace: s.account.source === "place",
    kind: KIND[s.kind] ?? s.kind,
    sourceLabel: SOURCE_LABEL[s.source] ?? s.source,
    primary: isPrimary(s.source),
    headline: s.headline,
    summary: s.summary,
    url: s.evidence_url,
    ago: `Found ${ago(s.detected_at)}`,
    fit: s.relevance,
    urgency: s.urgency,
    sample: s.status === "sample",
    builder: s.meta?.builder ?? null,
    people: (contacts ?? []).filter((c) => c.account_id === s.account.id).map((c) => ({ id: c.id as string, name: c.name as string, title: (c.title as string | null) ?? null })),
  }));

  return (
    <section className="screen" data-screen="signals">
      <AutoRefresh active={running.length > 0} />
      <JobNotice kinds={["scan_signals"]} />

      <SignalsBoard rows={board} scanning={running.length > 0} />

      <div className="card" style={{ marginTop: "1.5rem" }}>
        <h3>Watch an organization</h3>
        <p className="muted" style={{ marginTop: ".3rem" }}>
          Beyond the news, Verbalore reads SEC filings, job boards, company sites and GitHub directly, so it can see a change before it is written up or posted.
        </p>
        <form action={addOrganizations} style={{ marginTop: "1rem" }}>
          <div className="field">
            <label htmlFor="orgs">Organizations, one per line</label>
            <textarea id="orgs" name="orgs" rows={3} required placeholder={"A name is enough, a website helps.\nRamp, ramp.com\nLinear\nhttps://attio.com"} />
          </div>
          <details style={{ marginBottom: "1rem" }}>
            <summary className="muted" style={{ cursor: "pointer", minHeight: "2.6rem", display: "flex", alignItems: "center" }}>Add a contact (when watching one organization)</summary>
            <div style={{ display: "grid", gap: ".6rem", marginTop: ".5rem" }}>
              <input type="text" name="contact_name" placeholder="Name" aria-label="Contact name" />
              <input type="text" name="contact_title" placeholder="Title" aria-label="Contact title" />
              <input type="text" name="contact_email" inputMode="email" autoComplete="email" placeholder="Email" aria-label="Contact email" />
            </div>
          </details>
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", alignItems: "center" }}>
            <button className="btn primary">Watch and scan</button>
            <span className="muted" style={{ fontSize: ".9rem" }}>Up to 25 at a time. It scans straight away.</span>
          </div>
        </form>
        {searchParams.added !== undefined && (
          <p style={note(true)} role="status">
            {searchParams.added === "0"
              ? "Already on your list, so nothing new was added."
              : `Now watching ${searchParams.added} new organization${searchParams.added === "1" ? "" : "s"}${Number(searchParams.skipped) > 0 ? `, ${searchParams.skipped} already on the list` : ""}. The first scan is running.`}
          </p>
        )}
        {searchParams.org === "limit" && <p style={note(false)} role="status">The public demo has reached its hourly limit for this action. Try again in a while.</p>}
        {searchParams.org === "empty" && <p style={note(false)} role="status">Type at least one organization name.</p>}

        <form action={addPlace} style={{ marginTop: "1.25rem", display: "flex", flexWrap: "wrap", gap: ".75rem", alignItems: "center", padding: ".9rem 1rem", borderRadius: "var(--r2)", background: "var(--surf2)" }}>
          <div style={{ flex: 1, minWidth: "14rem" }}>
            <b>Watch a place</b>
            <p className="muted" style={{ fontSize: ".9rem" }}>Reads the city&apos;s own records: new-home permits, teardowns, large projects and the builders behind them. Updated daily.</p>
          </div>
          <select name="city" aria-label="City" style={{ width: "auto" }}>
            <option value="austin">Austin, TX</option>
          </select>
          <button className="btn">Watch</button>
        </form>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Who you are watching</h3>
        <div className="crew" style={{ marginTop: ".5rem" }}>
          {(accounts ?? []).map((a) => {
            const board = (a.meta as { jobBoard?: { provider: string } } | null)?.jobBoard;
            const mine = rows.filter((r) => r.account.id === a.id && r.status !== "sample");
            return (
              <div className="crow" key={a.id} style={{ alignItems: "start" }}>
                <div style={{ minWidth: 0 }}>
                  <b>{a.name}</b>
                  <span className="muted">{a.source === "place" ? " · city permit records" : a.domain ? ` · ${a.domain}` : " · no website found"}</span>
                  <div className="muted" style={{ fontSize: ".9rem" }}>
                    {a.source === "manual" ? "Added by you" : a.source === "place" ? "Place" : "Sample CRM"} · scanned {ago(a.last_scanned_at)}
                    {board && ` · job board: ${board.provider}`}
                  </div>
                  <details style={{ marginTop: ".25rem" }}>
                    <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: ".9rem", textDecoration: "underline" }}>
                      {countFor(a.id)} signal{countFor(a.id) === 1 ? "" : "s"}
                    </summary>
                    <div className="siglist" style={{ marginTop: ".5rem" }}>
                      {mine.slice(0, 12).map((r) => (
                        <div className="sig" key={r.id} style={{ cursor: "default" }}>
                          <span className="pill">{SOURCE_LABEL[r.source] ?? r.source}</span>
                          <span>{r.headline}</span>
                          {r.summary && <span className="muted" style={{ fontSize: ".9rem" }}>{r.summary}</span>}
                          {r.evidence_url && (
                            <a href={r.evidence_url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, textDecoration: "underline" }}>See the source</a>
                          )}
                        </div>
                      ))}
                      {countFor(a.id) === 0 && <p className="muted">Nothing found yet. Press Scan.</p>}
                    </div>
                  </details>
                </div>
                <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", justifyContent: "flex-end" }}>
                  <form action={scanOne}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn sm" disabled={running.length > 0}>Scan</button>
                  </form>
                  <form action={removeOrganization}>
                    <input type="hidden" name="id" value={a.id} />
                    <button className="btn sm quiet" aria-label={`Stop watching ${a.name}`}>Stop watching</button>
                  </form>
                </div>
              </div>
            );
          })}
          {!accounts?.length && <p className="muted">Nobody yet. Add an organization above.</p>}
        </div>
      </div>

      <div className="card" style={{ marginTop: "1rem" }}>
        <h3>Watch for something specific</h3>
        <form action={addWatch} style={{ display: "flex", flexWrap: "wrap", gap: ".6rem", marginTop: ".75rem" }}>
          <input type="text" name="phrase" placeholder="e.g. opened a new office, raised a seed round" aria-label="What to watch for" style={{ flex: 1, minWidth: "14rem", width: "auto" }} />
          <button className="btn">Add</button>
        </form>
        {!!watches?.length && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: ".5rem", marginTop: ".75rem" }}>
            {watches.map((w) => (
              <form key={w.id} action={removeWatch} className="pill" style={{ gap: ".5rem" }}>
                {w.phrase}
                <input type="hidden" name="id" value={w.id} />
                <button aria-label={`Stop watching ${w.phrase}`} style={{ opacity: 0.6, background: "none", border: 0, cursor: "pointer", padding: 0 }}>×</button>
              </form>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
