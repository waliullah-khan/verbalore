import AutoRefresh from "@/components/AutoRefresh";
import { activeJobs } from "@/lib/jobs";
import { currentWorkspace } from "@/lib/workspace";
import { addWatch, createNote, dismiss, removeWatch, scan } from "./actions";

const KIND: Record<string, string> = { funding: "Funding", leadership: "Leadership", launch: "Launch", hiring: "Hiring", custom: "Watching" };

type Row = {
  id: string; kind: string; headline: string; summary: string; evidence_url: string | null; detected_at: string;
  relevance: number; urgency: number; status: string;
  account: { id: string; name: string; domain: string | null; stage: string | null };
};

export default async function Signals() {
  const { db, ws } = await currentWorkspace();
  const [{ data: signals }, { data: contacts }, { data: accounts }, { data: watches }, running] = await Promise.all([
    db.from("vl_signals").select("*, account:vl_crm_accounts(id,name,domain,stage)").eq("workspace_id", ws.id).neq("status", "dismissed"),
    db.from("vl_crm_contacts").select("id,name,title,account_id").eq("workspace_id", ws.id),
    db.from("vl_crm_accounts").select("id,last_scanned_at").eq("workspace_id", ws.id),
    db.from("vl_signal_watches").select("id,phrase").eq("workspace_id", ws.id),
    activeJobs(db, ws.id, ["scan_signals"]),
  ]);

  const rows = ((signals ?? []) as Row[]).sort((a, b) => b.relevance * b.urgency - a.relevance * a.urgency);
  const scanned = (accounts ?? []).map((a) => a.last_scanned_at).filter(Boolean).sort().pop() as string | undefined;

  return (
    <div>
      <AutoRefresh active={running.length > 0} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Account-based</p>
          <h1 className="mt-1 text-4xl">Signals</h1>
          <p className="muted mt-2 max-w-xl">
            Changes at the {accounts?.length ?? 0} accounts in your CRM that are worth a personal video note.
            {scanned && ` Last scanned ${new Date(scanned).toLocaleString()}.`}
          </p>
        </div>
        <form action={scan}>
          <button className="btn btn-primary" disabled={running.length > 0}>{running.length ? "Scanning the web…" : "Scan accounts"}</button>
        </form>
      </div>

      <section className="card mt-6">
        <p className="eyebrow">Watch for something specific</p>
        <form action={addWatch} className="mt-3 flex flex-wrap gap-2">
          <input name="phrase" placeholder="e.g. opened a new office, raised a seed round" className="field min-w-0 flex-1" />
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

      <div className="mt-6 grid gap-4">
        {rows.map((s) => {
          const people = (contacts ?? []).filter((c) => c.account_id === s.account.id);
          return (
            <article key={s.id} className="card">
              <div className="flex flex-wrap items-center gap-2">
                <span className="chip" style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>{KIND[s.kind] ?? s.kind}</span>
                <span className="display text-lg">{s.account.name}</span>
                {s.account.stage && <span className="muted text-sm">{s.account.stage}</span>}
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
                {people.length > 0 ? (
                  <form action={createNote} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="signal" value={s.id} />
                    <select name="contact" className="field w-auto">
                      {people.map((c) => <option key={c.id} value={c.id}>{c.name} · {c.title}</option>)}
                    </select>
                    <button className="btn btn-primary">Make a video note</button>
                  </form>
                ) : (
                  <span className="muted text-sm">No contact on this account yet.</span>
                )}
                <form action={dismiss}>
                  <input type="hidden" name="id" value={s.id} />
                  <button className="btn btn-ghost">Dismiss</button>
                </form>
              </div>
            </article>
          );
        })}
        {!rows.length && (
          <div className="card text-center">
            <p className="display text-xl">No signals yet</p>
            <p className="muted mt-1 text-sm">Press “Scan accounts” and Verbalore searches the web for changes at each account.</p>
          </div>
        )}
      </div>
    </div>
  );
}
