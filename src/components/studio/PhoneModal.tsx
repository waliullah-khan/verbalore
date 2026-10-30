"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { createCapture } from "@/app/(app)/studio/[id]/actions";
import { fmt } from "./RecordMeasure";

export type Arrived = { path: string; previewUrl: string; durationS: number };
export type RecentTake = { id: string; title: string; seconds: number; when: string };
type Session = { token: string; url: string; svg: string; secure: boolean };
type Status = "waiting" | "uploading" | "uploaded";

const LAB = { done: "Done", work: "In progress", wait: "Waiting" } as const;

// The artifact's phone modal. Its pretend phone is a preview of the real one: it shows the screen your phone
// is on, which the computer can tell from the take's status (waiting, receiving, received).
export default function PhoneModal({ ideaId, noteId, lines, recent, onClose, onUse, onSave, toast }: {
  ideaId: string; noteId?: string; lines: string[]; recent: RecentTake[]; onClose: () => void; onUse: (a: Arrived) => void; onSave: (a: Arrived) => void; toast: (m: string) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<Status>("waiting");
  const [arrived, setArrived] = useState<Arrived | null>(null);
  const [list, setList] = useState(recent);
  const [view, setView] = useState<"recent" | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const started = useRef(false);
  const close = useRef<HTMLButtonElement>(null);
  const ring = useRef<SVGCircleElement>(null);

  async function create() {
    setError("");
    setArrived(null);
    setStatus("waiting");
    try {
      setSession(await createCapture({ ideaId, noteId }));
    } catch {
      setError("Could not create the link. Try again in a little while.");
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    create();
    close.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The computer polls for the take; the phone uploads straight to storage.
  useEffect(() => {
    if (!session || status === "uploaded") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/capture/${session.token}`, { cache: "no-store" });
        if (res.status === 410) return setError("This code expired. Make a new one.");
        if (!res.ok) return;
        const body = (await res.json()) as { status: Status; path: string | null; previewUrl: string | null; durationS: number | null };
        setStatus(body.status);
        if (body.status === "uploaded" && body.path && body.previewUrl) {
          const a = { path: body.path, previewUrl: body.previewUrl, durationS: Number(body.durationS) || 0 };
          setArrived(a);
          setList((l) => [{ id: `new-${Date.now()}`, title: "This take", seconds: a.durationS, when: "Just now" }, ...l]);
          toast("Video received from your phone");
        }
      } catch {
        // the next tick tries again
      }
    }, 2000);
    return () => clearInterval(t);
  }, [session, status, toast]);

  // the ring has no percentage to show here, so it keeps moving while the phone sends
  useEffect(() => {
    if (status !== "uploading" || !ring.current) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      gsap.set(ring.current, { strokeDashoffset: 132 });
      return;
    }
    const tw = gsap.fromTo(ring.current, { strokeDashoffset: 264 }, { strokeDashoffset: 0, duration: 1.6, ease: "none", repeat: -1 });
    return () => {
      tw.kill();
    };
  }, [status]);

  async function copy() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // the link is shown as text too
    }
  }

  const s = status === "waiting" ? 0 : status === "uploading" ? 4 : 5;
  const sec = view === "recent" ? 6 : s;
  const rows: [string, string, "done" | "work" | "wait"][] = [
    ["Phone connected", s === 0 ? "Waiting for your phone to scan the code" : "Your phone is connected", s === 0 ? "work" : "done"],
    ["Recording", s < 4 ? "Not started" : arrived ? `Recorded, ${fmt(arrived.durationS)}` : "Recorded", s < 4 ? "wait" : "done"],
    ["Sending to your computer", s < 4 ? "Not started" : s === 4 ? "Uploading" : "Received", s < 4 ? "wait" : s === 4 ? "work" : "done"],
    ["Ready to edit", s === 5 ? "Your video is here" : "Not yet", s === 5 ? "done" : "wait"],
  ];

  return (
    <div className="modal" id="phoneModal">
      <div className="card box wide" role="dialog" aria-modal="true" aria-labelledby="pmTitle">
        <div className="pm-head"><h2 id="pmTitle">Record on your phone</h2><button className="btn sm" id="pmClose" ref={close} onClick={onClose}>Close</button></div>
        <div className="pm-grid">
          <div className="pm-left">
            <p className="muted">Your phone camera is better and easier to hold at eye level. Scan the code, record, and the video arrives here ready to edit.</p>
            <div className="qrrow">
              <div
                className="qrbox"
                id="qrbox"
                role="img"
                aria-label="QR code to open the phone recorder"
                dangerouslySetInnerHTML={{ __html: session ? session.svg.replace("<svg", '<svg style="width:100%;height:100%;display:block"') : "" }}
              />
              <div className="pm-codes">
                <div className="lab">Or open this link on your phone</div>
                <div className="mono">{session ? session.url : "Making your link…"}</div>
                <div className="muted" style={{ fontSize: ".85rem" }}>Works for 2 hours and only for you.</div>
                <div style={{ display: "flex", gap: ".4rem", flexWrap: "wrap" }}>
                  <button className="btn quiet sm" onClick={copy} disabled={!session}>{copied ? "Copied" : "Copy link"}</button>
                  <button className="btn quiet sm" onClick={create}>New code</button>
                </div>
              </div>
            </div>
            <ol className="pm-steps" id="pmSteps">
              {rows.map(([name, note, st]) => (
                <li key={name}><div><b>{name}</b><small>{note}</small></div><span className={"pill" + (st === "done" ? " ok" : st === "work" ? " acc" : "")}>{LAB[st]}</span></li>
              ))}
            </ol>
            <div style={{ display: "flex", gap: ".6rem", flexWrap: "wrap" }}>
              <button className="btn primary lg" id="pmUse" disabled={!arrived} onClick={() => arrived && onUse(arrived)}>Use this video and edit</button>
              <button className="btn lg" id="pmSave" disabled={!arrived} onClick={() => arrived && onSave(arrived)}>Save to my Library for later</button>
            </div>
            {error ? (
              <p style={{ fontSize: ".85rem", color: "var(--warn)", fontWeight: 700 }} role="alert">{error}</p>
            ) : (
              <p className="muted" style={{ fontSize: ".85rem" }}>
                {session && !session.secure
                  ? "This link is not https, so phones open their camera app instead of the live teleprompter. Use the deployed https link, or set PUBLIC_BASE_URL to a tunnel, for the full experience."
                  : "The phone on the right shows the screen your phone is on."}
              </p>
            )}
          </div>
          <div>
            <div className="dev" aria-label="Phone preview">
              <section className="ph" data-ph="0" hidden={sec !== 0}><div className="ph-card"><b>Verbalore</b><p>Allow the camera and microphone so you can record your video.</p><p>Your video is private. Only you and your computer can see it.</p><button className="btn primary lg" id="phAllow" disabled title="This is a preview. Tap this on your phone.">Allow and continue</button></div></section>
              <section className="ph" data-ph="1" hidden>
                <div className="ph-cam"><i className="oval"></i><i className="head"></i><i className="body"></i></div>
                <div className="ph-top"><span id="phState">Ready</span><span id="phTime">0:00</span></div>
                <div className="ph-script" id="phScript"><div id="phScrollIn" style={{ transform: "translateY(30px)" }}>{lines.map((l, i) => <p key={i}>{l}</p>)}</div></div>
                <div className="ph-bar"><button className="ph-rec" id="phRec" aria-label="Start recording" disabled></button><span id="phHint">Tap to record</span></div>
                <div className="ph-count" id="phCount" hidden>3</div>
                <button className="ph-recent" id="phRecentBtn" aria-label="Recent on this phone" onClick={() => setView("recent")}>Recent<b id="phRecentN">{list.length}</b></button>
              </section>
              <section className="ph" data-ph="3" hidden><div className="ph-card"><b>Keep this video?</b><p id="phLen">0:41, sound and lighting look good.</p><div className="ph-actions"><button className="btn primary lg" id="phUse" disabled>Use it</button><button className="btn sec lg" id="phAgain" disabled>Record again</button></div></div></section>
              <section className="ph" data-ph="4" hidden={sec !== 4}><div className="ph-up"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="#243042" strokeWidth="10" /><circle id="phRing" ref={ring} cx="50" cy="50" r="42" fill="none" stroke="#fb923c" strokeWidth="10" strokeLinecap="round" strokeDasharray="264" strokeDashoffset="264" /></svg><span className="pct" id="phPct"></span><b>Sending to your computer</b><p id="phUpMsg">Keep this screen open.</p></div></section>
              <section className="ph" data-ph="5" hidden={sec !== 5}><div className="ph-card"><b>Sent</b><p>Your video is on your computer. Go back to it to edit and post.</p><div className="ph-actions"><button className="btn sec lg" id="phMore" onClick={create}>Record another</button><button className="btn sec lg" id="phRecentBtn2" onClick={() => setView("recent")}>Recent on this phone</button></div></div></section>
              <section className="ph" data-ph="6" hidden={sec !== 6}><div className="ph-list"><div className="ph-listhead"><b>Recent on this phone</b><button className="phback" id="phBack" onClick={() => setView(null)}>Back</button></div><div id="phList" className="ph-items">
                {list.length ? list.map((q) => (
                  <div className="phrow" key={q.id}><span className="phthumb"></span><div className="phinfo"><b>{q.title}</b><small>{fmt(q.seconds)}, {q.when}</small></div><span className="phst ok">Sent</span></div>
                )) : <p style={{ color: "#c8d1dc", padding: "1rem .2rem" }}>Nothing recorded on this phone yet.</p>}
              </div></div></section>
            </div>
            <p style={{ textAlign: "center", marginTop: ".7rem" }}><button className="btn sm quiet" id="phWeak" disabled title="Not available. This preview follows your real phone.">Simulate weak signal</button></p>
          </div>
        </div>
      </div>
    </div>
  );
}
