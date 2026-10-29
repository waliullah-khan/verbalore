"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";

type Beat = { label: string; text: string };
type Phase = "ready" | "countdown" | "recording" | "review" | "uploading" | "done";
type Take = { blob: Blob; url: string; seconds: number };

export default function PhoneRecorder({ token, title, beats }: { token: string; title: string; beats: Beat[] }) {
  const [phase, setPhase] = useState<Phase>("ready");
  const [live, setLive] = useState<boolean | null>(null); // null until we know whether the browser allows a camera
  const [camError, setCamError] = useState("");
  const [count, setCount] = useState(3);
  const [speed, setSpeed] = useState(5);
  const [paused, setPaused] = useState(false);
  const [take, setTake] = useState<Take | null>(null);
  const [error, setError] = useState("");

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const openCamera = useCallback(async () => {
    setCamError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (video.current) video.current.srcObject = stream.current;
    } catch {
      setCamError("The camera was blocked. Allow it for this page, or use your phone's camera app below.");
      setLive(false);
    }
  }, []);

  useEffect(() => {
    // Browsers only hand out the camera on https (or localhost), so a plain http link falls back to the camera app.
    const ok = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
    setLive(ok);
    if (ok) openCamera();
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, [openCamera]);

  useEffect(() => {
    if (phase !== "recording") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current && scroller.current) scroller.current.scrollTop += dt * speed * 14;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, speed]);

  const start = () => {
    if (!stream.current) return;
    scroller.current?.scrollTo({ top: 0 });
    setPhase("countdown");
    setCount(3);
    let n = 3;
    const t = setInterval(() => {
      n -= 1;
      setCount(n);
      if (n <= 0) {
        clearInterval(t);
        record();
      }
    }, 1000);
  };

  const record = async () => {
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    // 4 Mbps keeps a minute of phone video under the storage file limit
    const rec = new MediaRecorder(stream.current!, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      setTake({ blob, url: URL.createObjectURL(blob), seconds: (Date.now() - startedAt.current) / 1000 });
      setPhase("review");
      wake.current?.release().catch(() => {});
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start(1000);
    setPaused(false);
    setPhase("recording");
    try {
      wake.current = await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen") ?? null;
    } catch {
      // keeping the screen awake is a nicety
    }
  };

  const stop = () => recorder.current?.state === "recording" && recorder.current.stop();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    const el = document.createElement("video");
    el.preload = "metadata";
    el.src = URL.createObjectURL(file);
    const seconds = await new Promise<number>((res) => {
      el.onloadedmetadata = () => res(el.duration || 0);
      el.onerror = () => res(0);
    });
    setTake({ blob: file, url: el.src, seconds });
    setPhase("review");
  };

  const send = async () => {
    if (!take) return;
    setPhase("uploading");
    setError("");
    try {
      const ext = take.blob.type.includes("mp4") ? "mp4" : take.blob.type.includes("quicktime") ? "mov" : "webm";
      const sign = await fetch(`/api/capture/${token}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "sign", ext }) });
      if (!sign.ok) throw new Error(sign.status === 410 ? "This link has expired. Scan a fresh QR code." : "Could not start the upload.");
      const { path, token: signed } = (await sign.json()) as { path: string; token: string };

      const up = await supabaseBrowser().storage.from("vl-recordings").uploadToSignedUrl(path, signed, take.blob, { contentType: take.blob.type || "video/webm" });
      if (up.error) throw new Error(/size|large|exceed/i.test(up.error.message) ? "That video is too large. Record a shorter one." : up.error.message);

      const done = await fetch(`/api/capture/${token}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "done", path, durationS: take.seconds }) });
      if (!done.ok) throw new Error("The video uploaded but could not be saved. Try again.");
      setPhase("done");
    } catch (e) {
      setError((e as Error).message);
      setPhase("review");
    }
  };

  const retake = () => {
    setTake(null);
    setPhase("ready");
    if (live) openCamera();
  };

  if (phase === "done") {
    return (
      <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full text-3xl text-white" style={{ background: "var(--ok)" }} aria-hidden>✓</div>
        <h1 className="text-3xl">Sent to your computer</h1>
        <p className="muted">The edit starts there. You can close this page, or record another take.</p>
        <button className="btn btn-ghost" onClick={retake}>Record another take</button>
      </main>
    );
  }

  const script = (
    <>
      {beats.map((b, i) => (
        <p key={i} className="mb-7" style={{ color: b.label === "Hook" ? "#fdba74" : "#fff" }}>{b.text}</p>
      ))}
    </>
  );

  // No live camera: read the script here, then record with the phone's own camera app.
  if (live === false && phase !== "review" && phase !== "uploading") {
    return (
      <main className="mx-auto min-h-[100dvh] max-w-md px-5 pb-10 pt-6">
        <p className="eyebrow">Record on your phone</p>
        <h1 className="mt-1 text-2xl leading-tight">{title}</h1>
        {camError && <p className="mt-3 text-sm" style={{ color: "var(--warn)" }}>{camError}</p>}
        <div className="card mt-5 text-xl font-semibold leading-snug">{script}</div>
        <label className="btn btn-primary mt-6 w-full cursor-pointer py-4 text-base">
          Open the camera and record
          <input type="file" accept="video/*" capture="user" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
        </label>
        <p className="muted mt-3 text-center text-xs">
          Read the script above, then record. For the scrolling teleprompter, open this link over https.
        </p>
      </main>
    );
  }

  return (
    <main className="fixed inset-0 bg-black text-white">
      {phase === "review" || phase === "uploading" ? (
        take && <video src={take.url} controls playsInline className="h-full w-full object-contain" />
      ) : (
        <video ref={video} autoPlay muted playsInline className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
      )}

      {(phase === "ready" || phase === "countdown" || phase === "recording") && (
        <div
          className="absolute inset-x-0 top-0 h-[60%] bg-gradient-to-b from-black/80 via-black/55 to-transparent"
          onClick={() => phase === "recording" && setPaused((p) => !p)}
        >
          <div ref={scroller} className="h-full overflow-hidden px-6 pb-16 pt-12 text-center text-[34px] font-semibold leading-snug">
            {script}
            <div style={{ height: "40dvh" }} />
          </div>
        </div>
      )}

      {phase === "countdown" && <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-[9rem] font-bold">{Math.max(count, 1)}</div>}
      {phase === "recording" && <span className="absolute right-4 top-4 rounded-full bg-red-600 px-3 py-1 text-xs font-medium">● REC{paused ? " · paused" : ""}</span>}

      <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/85 to-transparent px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-10">
        {error && <p className="rounded-lg bg-black/70 p-3 text-center text-sm text-orange-300">{error}</p>}

        {phase === "ready" && (
          <>
            <div className="flex items-center justify-center gap-4 text-sm">
              <span>Speed</span>
              <button className="h-11 w-11 rounded-full bg-white/15 text-xl" onClick={() => setSpeed((s) => Math.max(1, s - 1))} aria-label="Slower">−</button>
              <span className="w-6 text-center tabular-nums">{speed}</span>
              <button className="h-11 w-11 rounded-full bg-white/15 text-xl" onClick={() => setSpeed((s) => Math.min(10, s + 1))} aria-label="Faster">+</button>
            </div>
            <button className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white" onClick={start} aria-label="Start recording">
              <span className="h-14 w-14 rounded-full bg-red-600" />
            </button>
            <p className="text-center text-xs text-white/70">Tap the script while recording to pause it.</p>
          </>
        )}
        {phase === "recording" && (
          <button className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border-4 border-white" onClick={stop} aria-label="Stop recording">
            <span className="h-8 w-8 rounded-md bg-red-600" />
          </button>
        )}
        {(phase === "review" || phase === "uploading") && (
          <div className="flex gap-3">
            <button className="btn btn-ghost flex-1 !border-white/40 !text-white" onClick={retake} disabled={phase === "uploading"}>Retake</button>
            <button className="btn btn-primary flex-[2] py-4" onClick={send} disabled={phase === "uploading"}>{phase === "uploading" ? "Sending…" : "Send to my computer"}</button>
          </div>
        )}
      </div>
    </main>
  );
}
