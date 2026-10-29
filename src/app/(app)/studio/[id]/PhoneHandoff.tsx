"use client";

import { useEffect, useState } from "react";
import { createCapture } from "./actions";

export type Arrived = { path: string; previewUrl: string; durationS: number };
type Session = { token: string; url: string; svg: string; secure: boolean };

const LABEL: Record<string, string> = {
  waiting: "Waiting for your phone",
  uploading: "Receiving the video…",
  uploaded: "Take received",
};

export default function PhoneHandoff({ ideaId, noteId, onArrived }: { ideaId: string; noteId?: string; onArrived: (t: Arrived) => void }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState("waiting");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  // The desktop polls for the take; the phone uploads straight to storage.
  useEffect(() => {
    if (!session || status === "uploaded") return;
    const t = setInterval(async () => {
      try {
        const res = await fetch(`/api/capture/${session.token}`, { cache: "no-store" });
        if (res.status === 410) return setError("This link expired. Create a new QR code.");
        if (!res.ok) return;
        const body = (await res.json()) as { status: string; path: string | null; previewUrl: string | null; durationS: number | null };
        setStatus(body.status);
        if (body.status === "uploaded" && body.path && body.previewUrl) {
          onArrived({ path: body.path, previewUrl: body.previewUrl, durationS: Number(body.durationS) || 0 });
        }
      } catch {
        // the next tick tries again
      }
    }, 2000);
    return () => clearInterval(t);
  }, [session, status, onArrived]);

  async function show() {
    setBusy(true);
    setError("");
    try {
      setSession(await createCapture({ ideaId, noteId }));
      setStatus("waiting");
    } catch {
      setError("Could not create the link. Try again.");
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!session) return;
    try {
      await navigator.clipboard.writeText(session.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // the link is also shown as text
    }
  }

  return (
    <div className="card">
      <p className="eyebrow">Record on your phone</p>
      {!session ? (
        <>
          <p className="muted mt-2 text-sm">Scan a code, record with the script on your phone, and the take lands here for editing.</p>
          <button className="btn btn-ghost mt-3" onClick={show} disabled={busy}>{busy ? "Creating…" : "Show QR code"}</button>
        </>
      ) : (
        <div className="mt-3 flex flex-col gap-4 sm:flex-row">
          <div
            className="h-[180px] w-[180px] shrink-0 overflow-hidden rounded-xl border bg-white p-1"
            style={{ borderColor: "var(--line)" }}
            role="img"
            aria-label="QR code to open the phone recorder"
            dangerouslySetInnerHTML={{ __html: session.svg.replace("<svg", '<svg style="width:100%;height:100%"') }}
          />
          <div className="min-w-0 space-y-2 text-sm">
            <span className="chip" style={status === "uploaded" ? { background: "var(--accent-soft)", color: "var(--ok)" } : undefined}>{LABEL[status] ?? status}</span>
            <p className="muted">Scan with your phone camera. It must be on the same Wi-Fi unless this app is online.</p>
            <p className="break-all text-xs">{session.url}</p>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-ghost !px-3 !py-1.5" onClick={copy}>{copied ? "Copied" : "Copy link"}</button>
              <button className="btn btn-ghost !px-3 !py-1.5" onClick={show} disabled={busy}>New code</button>
            </div>
            {!session.secure && (
              <p className="muted text-xs">
                This link is not https, so phones open their camera app instead of the live teleprompter. Use the deployed https link, or set PUBLIC_BASE_URL to a tunnel, for the full experience.
              </p>
            )}
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm" style={{ color: "var(--warn)" }}>{error}</p>}
    </div>
  );
}
