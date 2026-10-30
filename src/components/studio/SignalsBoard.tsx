"use client";

import { useMemo, useState } from "react";
import { addContact, addOrganizations, createNote, dismiss, ideaFromSignal, scan } from "@/app/(app)/signals/actions";

// The Signals screen from the Studio Lot design: a list of signals on the left and the one you picked on the right,
// with the action you can take on it. Every signal here was found by the scanner, none are samples of the design's.

export type SigRow = {
  id: string;
  accountId: string;
  co: string;
  isPlace: boolean;
  kind: string;
  sourceLabel: string;
  primary: boolean;
  headline: string;
  summary: string;
  url: string | null;
  ago: string;
  fit: number;
  urgency: number;
  sample: boolean;
  builder: string | null;
  people: { id: string; name: string; title: string | null }[];
};

type Filter = "all" | "primary" | "news";
// Scanned pages arrive as markdown. The list and the detail show it as plain sentences.
const plain = (t: string) =>
  t
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n).replace(/\s+\S*$/, "")}…` : t);

export default function SignalsBoard({ rows, scanning }: { rows: SigRow[]; scanning: boolean }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [pick, setPick] = useState<string | null>(null);

  const shown = useMemo(() => rows.filter((r) => (filter === "primary" ? r.primary : filter === "news" ? !r.primary : true)), [rows, filter]);
  const nPrimary = rows.filter((r) => r.primary).length;
  const s = shown.find((r) => r.id === pick) ?? shown[0];

  // on a narrow screen the detail sits below the list, so bring it into view when a signal is picked
  function pickSignal(id: string) {
    setPick(id);
    if (window.matchMedia("(max-width: 1000px)").matches) setTimeout(() => document.getElementById("sigDetail")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  return (
    <>
      <div style={{ display: "flex", flexWrap: "wrap", gap: ".75rem", alignItems: "center", justifyContent: "space-between", marginBottom: "1rem" }}>
        <div className="seg" role="group" aria-label="Filter signals">
          {(
            [
              ["all", `All (${rows.length})`],
              ["primary", `Found at the source (${nPrimary})`],
              ["news", `News (${rows.length - nPrimary})`],
            ] as const
          ).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)}>
              {label}
            </button>
          ))}
        </div>
        <form action={scan}>
          <button className="btn primary" disabled={scanning}>{scanning ? "Scanning…" : "Scan all"}</button>
        </form>
      </div>

      {s ? (
        <div className="siggrid">
          <div className="siglist" id="sigList">
            {shown.map((r) => (
              <button type="button" className="sig" key={r.id} data-id={r.id} aria-pressed={r.id === s.id} onClick={() => pickSignal(r.id)}>
                <span className="co">{r.co}</span>
                <span>{r.headline}</span>
                <span className="muted" style={{ fontSize: ".9rem" }}>{clip(plain(r.summary) || `Read from ${r.sourceLabel}.`, 150)}</span>
                <span style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                  <span className="pill acc">{r.kind}</span>
                  <span className="pill">{r.sourceLabel}</span>
                  {r.sample && <span className="pill">sample</span>}
                  <span className="pill">{r.ago}</span>
                </span>
              </button>
            ))}
          </div>

          <div className="card" id="sigDetail" style={{ position: "sticky", top: "1rem" }}>
            <h2>{s.co}</h2>
            <p className="muted" style={{ margin: ".3rem 0 1rem" }}>
              {s.people.length ? `${s.people[0].name}${s.people[0].title ? `, ${s.people[0].title}` : ""}` : s.isPlace ? "City records" : "No contact yet"}
            </p>
            <div className="lab">What we found</div>
            <div className="scriptprev" style={{ margin: ".5rem 0 1rem" }}>
              <p style={{ overflowWrap: "anywhere" }}>{s.headline}</p>
              {plain(s.summary) && <p style={{ overflowWrap: "anywhere" }}>{clip(plain(s.summary), 420)}</p>}
            </div>
            <p className="muted" style={{ fontSize: ".9rem", marginBottom: "1rem" }}>
              {s.sourceLabel}
              {s.primary ? ", read directly from the source" : ", reported in the news"}. Fit {Math.round(s.fit * 100)}, urgency {Math.round(s.urgency * 100)}.
              {s.url && !s.url.includes("example.com") && (
                <>
                  {" "}
                  <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ fontWeight: 700, textDecoration: "underline" }}>See the source</a>
                </>
              )}
            </p>
            {!s.isPlace && <p className="g-on muted" style={{ marginBottom: "1rem" }}>Each video note you send adds 40 experience, and one that gets opened adds 25.</p>}

            {!s.isPlace && s.people.length > 0 && (
              <div className="field">
                <label htmlFor="note-contact">Who is it for</label>
                <select id="note-contact" form="note-form" name="contact">
                  {s.people.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}{c.title ? ` · ${c.title}` : ""}</option>
                  ))}
                </select>
              </div>
            )}
            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap", alignItems: "center" }}>
              {s.isPlace ? (
                <>
                  <form action={ideaFromSignal}>
                    <input type="hidden" name="signal" value={s.id} />
                    <button className="btn primary lg">Make a video from this</button>
                  </form>
                  {s.builder && (
                    <form action={addOrganizations}>
                      <input type="hidden" name="orgs" value={s.builder} />
                      <button className="btn">Watch {s.builder}</button>
                    </form>
                  )}
                </>
              ) : s.people.length ? (
                <>
                  <form id="note-form" action={createNote} hidden>
                    <input type="hidden" name="signal" value={s.id} />
                  </form>
                  <button form="note-form" className="btn primary lg">Make a video note</button>
                </>
              ) : (
                <details style={{ width: "100%" }}>
                  <summary className="muted" style={{ cursor: "pointer", minHeight: "2.6rem", display: "flex", alignItems: "center" }}>No contact yet. Add one to send a video note.</summary>
                  <form action={addContact} style={{ display: "grid", gap: ".6rem", marginTop: ".5rem" }}>
                    <input type="hidden" name="account" value={s.accountId} />
                    <input type="text" name="name" required placeholder="Name" aria-label="Name" />
                    <input type="text" name="title" placeholder="Title" aria-label="Title" />
                    <input type="text" name="email" inputMode="email" autoComplete="email" placeholder="Email" aria-label="Email" />
                    <div><button className="btn primary">Add contact</button></div>
                  </form>
                </details>
              )}
              <form action={dismiss}>
                <input type="hidden" name="id" value={s.id} />
                <button className="btn quiet" title="Take this signal off the list">Not now</button>
              </form>
            </div>
          </div>
        </div>
      ) : (
        <div className="card" style={{ textAlign: "center" }}>
          <h3>No signals yet</h3>
          <p className="muted" style={{ marginTop: ".4rem" }}>{rows.length ? "Nothing matches this filter." : "Add an organization below, or press Scan all."}</p>
        </div>
      )}
    </>
  );
}
