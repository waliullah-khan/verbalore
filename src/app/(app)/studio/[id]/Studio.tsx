"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Beat } from "@/lib/ideas/types";
import { submitRecording } from "./actions";
import PhoneHandoff, { type Arrived } from "./PhoneHandoff";

type Phase = "setup" | "countdown" | "recording" | "review" | "uploading";

type ThemeOption = { id: string; label: string; blurb: string };

export default function Studio({ ideaId, workspaceId, title, beats, themes, noteId }: { ideaId: string; workspaceId: string; title: string; beats: Beat[]; themes: ThemeOption[]; noteId?: string }) {
  const [phase, setPhase] = useState<Phase>("setup");
  const [count, setCount] = useState(3);
  const [speed, setSpeed] = useState(5);
  const [size, setSize] = useState(44);
  const [mirror, setMirror] = useState(false);
  const [paused, setPaused] = useState(false);
  const [error, setError] = useState("");
  const [template, setTemplate] = useState(themes[0].id);
  const [take, setTake] = useState<{ blob: Blob; url: string; seconds: number } | null>(null);
  const [remote, setRemote] = useState<Arrived | null>(null);

  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const live = useRef<HTMLVideoElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const pausedRef = useRef(false);
  pausedRef.current = paused;

  const openCamera = useCallback(async () => {
    setError("");
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      if (live.current) live.current.srcObject = stream.current;
    } catch {
      setError("Camera or microphone access was blocked. Allow it in the browser, or upload a video instead.");
    }
  }, []);

  useEffect(() => {
    openCamera();
    return () => stream.current?.getTracks().forEach((t) => t.stop());
  }, [openCamera]);

  // scroll the script while recording
  useEffect(() => {
    if (phase !== "recording") return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      if (!pausedRef.current && scroller.current) scroller.current.scrollTop += dt * speed * 12;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase, speed]);

  const finish = useCallback(() => {
    if (recorder.current?.state === "recording") recorder.current.stop();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Space" && phase === "recording") {
        e.preventDefault();
        setPaused((p) => !p);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  function begin() {
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
        startRecording();
      }
    }, 1000);
  }

  function startRecording() {
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream.current!, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      setTake({ blob, url: URL.createObjectURL(blob), seconds: (Date.now() - startedAt.current) / 1000 });
      setPhase("review");
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start(1000);
    setPaused(false);
    setPhase("recording");
  }

  async function confirmTake(blob: Blob, seconds: number) {
    setPhase("uploading");
    setError("");
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("quicktime") ? "mov" : "webm";
    const path = `${workspaceId}/${ideaId}/${Date.now()}.${ext}`;
    const { error: upErr } = await supabaseBrowser().storage.from("vl-recordings").upload(path, blob, { contentType: blob.type, upsert: false });
    if (upErr) {
      setError(`Upload failed: ${upErr.message}`);
      setPhase("review");
      return;
    }
    await submitRecording({ ideaId, path, durationS: seconds, template, noteId });
  }

  async function confirmRemote() {
    if (!remote) return;
    setPhase("uploading");
    setError("");
    try {
      await submitRecording({ ideaId, path: remote.path, durationS: remote.durationS, template, noteId });
    } catch {
      setError("Could not start the edit. Try again.");
      setPhase("setup");
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const video = document.createElement("video");
    video.preload = "metadata";
    video.src = URL.createObjectURL(file);
    const seconds = await new Promise<number>((res) => {
      video.onloadedmetadata = () => res(video.duration || 0);
      video.onerror = () => res(0);
    });
    setTake({ blob: file, url: video.src, seconds });
    setPhase("review");
  }

  const busy = phase === "countdown" || phase === "recording" || phase === "uploading";

  return (
    <div className="space-y-5">
      <div>
        <Link href="/ideas" className="muted text-sm">← Back</Link>
        <h1 className="mt-2 text-3xl leading-tight">{title}</h1>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr]">
        <div className="relative mx-auto aspect-[9/16] w-full max-w-[420px] overflow-hidden rounded-3xl bg-black">
          {phase === "review" && take ? (
            <video src={take.url} controls playsInline className="h-full w-full object-cover" />
          ) : (
            <video ref={live} autoPlay muted playsInline className="h-full w-full object-cover" style={{ transform: "scaleX(-1)" }} />
          )}

          {(phase === "recording" || phase === "countdown" || phase === "setup") && (
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[62%] bg-gradient-to-b from-black/75 via-black/55 to-transparent">
              <div ref={scroller} className="h-full overflow-hidden px-6 pb-16 pt-10 text-center font-semibold leading-snug text-white" style={{ fontSize: size, transform: mirror ? "scaleX(-1)" : undefined }}>
                {beats.map((b, i) => (
                  <p key={i} className="mb-8" style={{ color: b.label === "Hook" ? "#fdba74" : "#fff" }}>{b.text}</p>
                ))}
                <div style={{ height: "40vh" }} />
              </div>
            </div>
          )}

          {phase === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-9xl font-bold text-white">{Math.max(count, 1)}</div>
          )}
          {phase === "recording" && <span className="absolute right-4 top-4 rounded-full bg-red-600 px-3 py-1 text-xs font-medium text-white">● REC {paused && "· paused"}</span>}
        </div>

        <div className="space-y-4">
          {error && <p className="card text-sm" style={{ color: "var(--warn)" }}>{error}</p>}

          <div className="card space-y-4">
            <div className="flex flex-wrap gap-3">
              {phase === "setup" && <button className="btn btn-primary" onClick={begin}>Start recording</button>}
              {phase === "recording" && (
                <>
                  <button className="btn btn-primary" onClick={finish}>Stop</button>
                  <button className="btn btn-ghost" onClick={() => setPaused((p) => !p)}>{paused ? "Resume scroll" : "Pause scroll"}</button>
                </>
              )}
              {phase === "review" && take && (
                <>
                  <button className="btn btn-primary" onClick={() => confirmTake(take.blob, take.seconds)}>Use this take</button>
                  <button className="btn btn-ghost" onClick={() => { setTake(null); setPhase("setup"); openCamera(); }}>Retake</button>
                </>
              )}
              {phase === "uploading" && <span className="muted text-sm">Uploading and queuing the edit…</span>}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Scroll speed
                <input type="range" min={1} max={10} value={speed} disabled={phase === "uploading"} onChange={(e) => setSpeed(+e.target.value)} className="w-full" />
              </label>
              <label className="text-sm">Text size
                <input type="range" min={28} max={64} value={size} onChange={(e) => setSize(+e.target.value)} className="w-full" />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={mirror} onChange={(e) => setMirror(e.target.checked)} /> Mirror text for a beam-splitter prompter</label>
            <p className="muted text-xs">Space pauses the scroll while you record.</p>
          </div>

          <div className="card">
            <p className="eyebrow">Edit style</p>
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {themes.map((t) => (
                <button key={t.id} disabled={busy} onClick={() => setTemplate(t.id)} className={`rounded-xl border p-3 text-left text-sm transition ${template === t.id ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--line)] hover:bg-[var(--paper-2)]"}`}>
                  <span className="font-medium">{t.label}</span>
                  <span className="muted mt-0.5 block text-xs">{t.blurb}</span>
                </button>
              ))}
            </div>
          </div>

          {remote && (
            <div className="card space-y-3" style={{ borderColor: "var(--accent)" }}>
              <p className="eyebrow">Take from your phone</p>
              <video src={remote.previewUrl} controls playsInline className="mx-auto aspect-[9/16] max-h-[420px] rounded-2xl bg-black object-cover" />
              <div className="flex flex-wrap gap-3">
                <button className="btn btn-primary" onClick={confirmRemote} disabled={phase === "uploading"}>
                  {phase === "uploading" ? "Starting the edit…" : "Edit this take"}
                </button>
                <button className="btn btn-ghost" onClick={() => setRemote(null)} disabled={phase === "uploading"}>Discard</button>
              </div>
            </div>
          )}

          {!remote && <PhoneHandoff ideaId={ideaId} noteId={noteId} onArrived={setRemote} />}

          <div className="card">
            <p className="eyebrow">Already have a video?</p>
            <input type="file" accept="video/*" disabled={busy} onChange={(e) => onFile(e.target.files?.[0])} className="mt-2 block text-sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
