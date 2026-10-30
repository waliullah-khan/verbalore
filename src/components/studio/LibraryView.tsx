"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import Sticker from "./Sticker";
import { toast } from "./toast";
import { fmtClock, gradientOf, themeName } from "./EditThemes";
import { duplicateVideo, editRecording, removeRecording, removeVideo, retryRender } from "@/app/(app)/library/actions";
import type { InboxItem, LibItem } from "@/app/(app)/library/types";

const FILTERS: [string, string][] = [["all", "All"], ["draft", "Drafts"], ["scheduled", "Scheduled"], ["posted", "Posted"], ["note", "Notes"]];

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(/\s?([AP])M/, (_, a: string) => ` ${a.toLowerCase()}m`);

function dateLabel(v: LibItem) {
  if (v.whenKind === "scheduled") return `${day(v.when)}, ${clock(v.when)}`;
  if (v.whenKind === "made") return `Made ${day(v.when)}`;
  return day(v.when);
}

function Thumb({ item, children }: { item: LibItem; children?: React.ReactNode }) {
  return (
    <>
      {item.videoUrl && (
        <video
          src={`${item.videoUrl}#t=0.4`}
          preload="metadata"
          muted
          playsInline
          aria-hidden="true"
          tabIndex={-1}
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
      {children}
    </>
  );
}

function Detail({ v, onDuplicate, busy }: { v: LibItem; onDuplicate: () => void; busy: boolean }) {
  const [c0, c1] = gradientOf(v.th);
  const copy = () => {
    const link = v.shareUrl;
    if (!link) return toast("There is no link yet");
    try {
      navigator.clipboard.writeText(link).then(
        () => toast(v.kind === "note" ? "Share link copied" : "Video link copied"),
        () => toast("Select the link and copy it")
      );
    } catch {
      toast("Select the link and copy it");
    }
  };
  return (
    <>
      <div className="sumrow">
        <div className="thumb" style={{ background: `linear-gradient(160deg,${c0},${c1})`, maxHeight: "11rem", position: "relative", overflow: "hidden" }}>
          <Thumb item={v}><span style={{ position: "relative", textShadow: "0 1px 4px rgba(0,0,0,.7)" }}>{themeName(v.th)}</span></Thumb>
        </div>
        <div style={{ display: "grid", gap: ".4rem", alignContent: "start" }}>
          <h3>{v.t}</h3>
          <span className="muted mono" suppressHydrationWarning>{fmtClock(v.len)}, {dateLabel(v)}</span>
        </div>
      </div>
      {v.st === "posted" ? (
        <div>
          <div className="lab" style={{ marginBottom: ".4rem" }}>Where it went</div>
          <div className="bars">
            {v.results.map((r) => (
              <div key={r.name}>
                <span>{r.name}</span>
                <i style={{ width: r.ok === false ? "6%" : "100%" }} />
                {r.url ? <a className="mono" href={r.url} target="_blank" rel="noopener noreferrer">View</a> : <span className="mono">{r.ok === false ? "Failed" : "Live"}</span>}
              </div>
            ))}
          </div>
          <p className="muted" style={{ marginTop: ".6rem", fontSize: ".9rem" }}>View counts from each platform are not connected yet.</p>
        </div>
      ) : v.st === "note" ? (
        <p><b>{v.opens}</b> time{v.opens === 1 ? "" : "s"} opened by the contact.</p>
      ) : v.st === "scheduled" ? (
        <p suppressHydrationWarning>Scheduled for {dateLabel(v)} on {v.pl.join(", ")}.</p>
      ) : (
        <p className="muted">This draft has not been posted.</p>
      )}
      <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
        <Link className="btn primary" href={`/library/${v.videoId}/edit`}>Open in editor</Link>
        <button className="btn quiet" onClick={onDuplicate} disabled={busy || !v.videoId}>Duplicate</button>
        <button className="btn quiet" onClick={copy}>Copy link</button>
      </div>
    </>
  );
}

function PqCard({ q, busy, run }: { q: InboxItem; busy: boolean; run: (fn: () => Promise<{ error?: string } | { ok: true; videoId?: string }>, done: string, next?: (r: { videoId?: string }) => void) => void }) {
  const state =
    q.kind === "recording" ? <span className="pill ok">Ready to edit</span>
    : q.kind === "editing" ? <span className="pill acc">Editing</span>
    : <span className="pill">Edit failed</span>;
  return (
    <div className="pq">
      <div>
        <b>{q.t}</b>
        <div className="muted" style={{ fontSize: ".9rem" }} suppressHydrationWarning>{q.sec ? `${fmtClock(q.sec)}, ` : ""}{day(q.when)}, {clock(q.when)}</div>
      </div>
      {state}
      {q.note && <p className="muted" style={{ fontSize: ".85rem" }}>{q.note}</p>}
      <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
        {q.kind === "recording" && (
          <>
            <button className="btn sm primary" disabled={busy} onClick={() => run(() => editRecording(q.id), "Sent to the editor", (r) => r.videoId && window.location.assign(`/library/${r.videoId}/edit`))}>Edit this video</button>
            <button className="btn sm quiet" disabled={busy} onClick={() => run(() => removeRecording(q.id), "Removed")}>Remove</button>
          </>
        )}
        {q.kind === "failed" && (
          <>
            <button className="btn sm primary" disabled={busy} onClick={() => run(() => retryRender(q.id), "Sent to the editor again")}>Retry now</button>
            <button className="btn sm quiet" disabled={busy} onClick={() => run(() => removeVideo(q.id), "Removed")}>Remove</button>
          </>
        )}
        {q.kind === "editing" && <button className="btn sm quiet" disabled>Editing</button>}
      </div>
    </div>
  );
}

export default function LibraryView({ items, inbox, demo }: { items: LibItem[]; inbox: InboxItem[]; demo: boolean }) {
  const router = useRouter();
  const root = useRef<HTMLElement>(null);
  const [q, setQ] = useState("");
  const [f, setF] = useState("all");
  const [sel, setSel] = useState<string | null>(items[0]?.id ?? null);
  const [sheet, setSheet] = useState(false);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(
    () => items.filter((v) => (f === "all" || v.st === f) && (!q || `${v.t} ${v.pl.join(" ")}`.toLowerCase().includes(q.toLowerCase()))),
    [items, q, f]
  );
  const current = items.find((x) => x.id === sel) ?? rows[0] ?? null;

  const isNarrow = () => {
    const w = (root.current?.closest(".appc") as HTMLElement | null)?.clientWidth ?? window.innerWidth;
    return w > 0 && w < 700;
  };

  useEffect(() => {
    if (!sheet) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) gsap.fromTo("#libSheet .sheet", { y: "100%" }, { y: 0, duration: 0.35, ease: "power3.out" });
    document.getElementById("sheetClose")?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheet(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet]);

  const run = useCallback(
    async (fn: () => Promise<{ error?: string } | { ok: true; videoId?: string }>, done: string, next?: (r: { videoId?: string }) => void) => {
      setBusy(true);
      try {
        const r = await fn();
        if ("error" in r && r.error) toast(r.error);
        else {
          toast(done);
          if (next) next(r as { videoId?: string });
          else router.refresh();
        }
      } catch {
        toast("That did not work. Please try again.");
      } finally {
        setBusy(false);
      }
    },
    [router]
  );

  const duplicate = () => {
    const v = current;
    if (!v?.videoId) return;
    run(() => duplicateVideo(v.videoId!), "Copied to your drafts", () => {
      setSheet(false);
      router.refresh();
    });
  };

  const rdy = inbox.filter((x) => x.kind === "recording").length;
  const edit = inbox.filter((x) => x.kind === "editing").length;
  const bad = inbox.filter((x) => x.kind === "failed").length;
  const fromPhone = inbox.some((x) => x.fromPhone);

  return (
    <>
      <section className="screen" data-screen="library" ref={root}>
        {inbox.length > 0 && (
          <div className="card" id="libInbox" style={{ marginBottom: "1rem" }}>
            <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
              <Sticker name={fromPhone ? "phone" : "bulb"} size={3.2} still label={fromPhone ? "Phone" : "Editing"} />
              <div>
                <h3>{fromPhone ? "From your phone" : "Waiting for you"}</h3>
                <p className="muted" style={{ fontSize: ".95rem" }}>
                  {rdy ? `${rdy} ready to edit` : "Nothing ready to edit yet"}
                  {edit ? `, ${edit} being edited` : ""}
                  {bad ? `, ${bad} did not finish` : ""}.
                </p>
              </div>
            </div>
            <div className="pqrow">
              {inbox.map((x) => <PqCard key={`${x.kind}-${x.id}`} q={x} busy={busy} run={run} />)}
            </div>
          </div>
        )}

        <div className="libtools">
          <div className="field" style={{ margin: 0, minWidth: "14rem", flex: 1, maxWidth: "22rem" }}>
            <label htmlFor="libQ">Search</label>
            <input type="text" id="libQ" placeholder="Title or platform" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="seg" id="libFilter">
            {FILTERS.map(([v, label]) => (
              <button key={v} data-v={v} aria-pressed={f === v} onClick={() => setF(v)}>{label}</button>
            ))}
          </div>
        </div>

        <div className="libgrid">
          <div className="llist" id="libList">
            {rows.length ? (
              rows.map((v, i) => {
                const [c0, c1] = gradientOf(v.th);
                return (
                  <button
                    key={v.id}
                    className="lrow"
                    data-id={v.id}
                    aria-pressed={v.id === current?.id}
                    onClick={() => {
                      setSel(v.id);
                      if (isNarrow()) setSheet(true);
                    }}
                  >
                    <span className="t" style={{ ["--c1" as string]: c0, ["--c2" as string]: c1, position: "relative", overflow: "hidden" } as React.CSSProperties}>
                      {i < 24 && <Thumb item={v} />}
                    </span>
                    <span>
                      <b>{v.t}</b>
                      <small suppressHydrationWarning>{v.pl.length ? `${v.pl.join(", ")}, ` : ""}{dateLabel(v)}</small>
                    </span>
                    <span className={`pill ${v.st === "posted" ? "ok" : v.st === "scheduled" ? "acc" : ""}`}>{v.pill}</span>
                  </button>
                );
              })
            ) : items.length ? (
              <div className="card">
                <h3>No videos match</h3>
                <p className="muted" style={{ margin: ".4rem 0 1rem" }}>Try a different word or clear the filter.</p>
                <button className="btn" onClick={() => { setQ(""); setF("all"); }}>Show everything</button>
              </div>
            ) : (
              <div className="card">
                <h3>No videos yet</h3>
                <p className="muted" style={{ margin: ".4rem 0 1rem" }}>Pick an idea on the Today page and record it. The finished edit lands here.</p>
                <Link className="btn primary" href="/ideas">Choose an idea</Link>
              </div>
            )}
          </div>
          <aside className="card detail" id="libDetail">
            {current ? <Detail v={current} onDuplicate={duplicate} busy={busy} /> : <p className="muted">Select a video to see details.</p>}
          </aside>
        </div>
        {demo && <p className="muted" style={{ fontSize: ".9rem", marginTop: "1rem" }}>This is the demo workspace, so posting is simulated.</p>}
      </section>

      <div className="modal sheetwrap" id="libSheet" hidden={!sheet} onClick={(e) => e.target === e.currentTarget && setSheet(false)}>
        <div className="sheet" role="dialog" aria-modal="true" aria-label="Video details">
          <div className="grab" />
          <div id="sheetBody" style={{ display: "grid", gap: "1rem" }}>
            {current && <Detail v={current} onDuplicate={duplicate} busy={busy} />}
          </div>
          <button className="btn lg" id="sheetClose" style={{ width: "100%", marginTop: "1rem" }} onClick={() => setSheet(false)}>Close</button>
        </div>
      </div>
    </>
  );
}
