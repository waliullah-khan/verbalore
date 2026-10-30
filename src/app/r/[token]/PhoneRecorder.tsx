"use client";

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import { uploadSigned } from "@/components/studio/PhoneUpload";
import { durationOf, fmt, lightCheck, openMeter, sampleLuma, soundCheck, type Check } from "@/components/studio/RecordMeasure";
import "./phone.css";

type Beat = { label: string; text: string };
type View = "intro" | "cam" | "review" | "upload" | "sent" | "recent" | "fallback";
type Take = { blob: Blob; url: string; seconds: number; note: string };
type Recent = { id: string; t: string; sec: number; at: string };

const STORE = "vl-phone-recent";
const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

const load = (): Recent[] => {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "[]");
  } catch {
    return [];
  }
};

const when = (iso: string) => {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? `Today, ${time}` : `${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${time}`;
};

// What the phone says about a take: only what was measured, never a claim it did not check.
function verdict(seconds: number, checks: (Check | null)[]) {
  const known = checks.filter((c): c is Check => !!c);
  if (!known.length) return `${fmt(seconds)}.`;
  if (known.every((c) => c.ok)) return `${fmt(seconds)}, sound and lighting look good.`;
  return `${fmt(seconds)}. ${known.filter((c) => !c.ok).map((c) => c.text).join(". ")}.`;
}

export default function PhoneRecorder({ token, title, beats }: { token: string; title: string; beats: Beat[] }) {
  const [view, setView] = useState<View>("intro");
  const [camError, setCamError] = useState("");
  const [state, setState] = useState({ text: "Ready", rec: false });
  const [time, setTime] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [recording, setRecording] = useState(false);
  const [take, setTake] = useState<Take | null>(null);
  const [pct, setPct] = useState(0);
  const [upError, setUpError] = useState("");
  const [recent, setRecent] = useState<Recent[]>([]);

  const stream = useRef<MediaStream | null>(null);
  const meter = useRef<ReturnType<typeof openMeter>>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const video = useRef<HTMLVideoElement>(null);
  const scrollIn = useRef<HTMLDivElement>(null);
  const tw = useRef<gsap.core.Tween | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const cd = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const wake = useRef<{ release: () => Promise<void> } | null>(null);
  const rms = useRef<number[]>([]);
  const luma = useRef<number[]>([]);
  const before = useRef<View>("intro");
  const live = useRef(false);

  useEffect(() => {
    setRecent(load());
    // Browsers only hand out the camera on https (or localhost), so a plain http link falls back to the camera app.
    const ok = window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
    if (!ok) setView("fallback");
    return () => {
      clearInterval(timer.current);
      clearInterval(cd.current);
      tw.current?.kill();
      stream.current?.getTracks().forEach((t) => t.stop());
      meter.current?.close();
    };
  }, []);

  useEffect(() => {
    if (view === "cam" && video.current && stream.current) video.current.srcObject = stream.current;
    if (view === "cam" && scrollIn.current) gsap.set(scrollIn.current, { y: 30 });
  }, [view]);

  async function allow() {
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      meter.current = openMeter(stream.current);
      live.current = true;
      setView("cam");
    } catch {
      setCamError("The camera was blocked. Allow it for this page, or use your phone's camera app below.");
      setView("fallback");
    }
  }

  function ready() {
    setState({ text: "Ready", rec: false });
    setTime(0);
    setRecording(false);
    setCount(null);
    if (scrollIn.current) gsap.set(scrollIn.current, { y: 30 });
  }

  function beginRecorder() {
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    // 4 Mbps keeps a minute of phone video under the storage file limit
    const rec = new MediaRecorder(stream.current!, mime ? { mimeType: mime, videoBitsPerSecond: 4_000_000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      const seconds = (Date.now() - startedAt.current) / 1000;
      const note = verdict(seconds, [soundCheck(rms.current), lightCheck(luma.current)]);
      setTake({ blob, url: URL.createObjectURL(blob), seconds, note });
      setView("review");
      wake.current?.release().catch(() => undefined);
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start(1000);
  }

  async function onRec() {
    if (!recording && count === null) {
      let n = 3;
      setCount(n);
      cd.current = setInterval(async () => {
        n--;
        if (n > 0) return setCount(n);
        clearInterval(cd.current);
        setCount(null);
        setRecording(true);
        setState({ text: "Recording", rec: true });
        rms.current = [];
        luma.current = [];
        beginRecorder();
        try {
          wake.current = (await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } }).wakeLock?.request("screen")) ?? null;
        } catch {
          // keeping the screen awake is a nicety
        }
        const inner = scrollIn.current;
        if (inner) {
          const words = beats.map((b) => b.text).join(" ").split(/\s+/).length;
          tw.current = gsap.to(inner, { y: -(inner.scrollHeight - 20), duration: Math.max(10, (words / 140) * 60), ease: "none" });
        }
        let el = 0;
        let tick = 0;
        timer.current = setInterval(() => {
          el += 0.1;
          tick++;
          setTime(el);
          rms.current.push(meter.current?.level() ?? 0);
          if (tick % 10 === 0 && video.current) {
            const l = sampleLuma(video.current);
            if (l !== null) luma.current.push(l);
          }
        }, 100);
      }, reduce() ? 250 : 850);
    } else if (recording) {
      clearInterval(timer.current);
      tw.current?.kill();
      setRecording(false);
      if (recorder.current?.state === "recording") recorder.current.stop();
    }
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const { seconds, url } = await durationOf(file);
    setTake({ blob: file, url, seconds, note: `${fmt(seconds)}.` });
    setView("review");
  }

  async function send(t: Take | null = take) {
    if (!t) return;
    setView("upload");
    setPct(0);
    setUpError("");
    try {
      const ext = t.blob.type.includes("mp4") ? "mp4" : t.blob.type.includes("quicktime") ? "mov" : "webm";
      const sign = await fetch(`/api/capture/${token}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "sign", ext }) });
      if (!sign.ok) throw new Error(sign.status === 410 ? "This link has expired. Scan a fresh QR code." : "Could not start the upload.");
      const { path, token: signed } = (await sign.json()) as { path: string; token: string };

      const up = await uploadSigned(path, signed, t.blob, setPct);
      if (up.error) throw new Error(/size|large|exceed/i.test(up.error) ? "That video is too large. Record a shorter one." : up.error);

      const done = await fetch(`/api/capture/${token}/upload`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ step: "done", path, durationS: t.seconds }) });
      if (!done.ok) throw new Error("The video uploaded but could not be saved. Try again.");

      const next = [{ id: `${Date.now()}`, t: title, sec: t.seconds, at: new Date().toISOString() }, ...load()].slice(0, 10);
      try {
        localStorage.setItem(STORE, JSON.stringify(next));
      } catch {
        // the list is only a convenience
      }
      setRecent(next);
      setView("sent");
    } catch (e) {
      setUpError((e as Error).message);
    }
  }

  function again() {
    setTake((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    ready();
    setView(live.current ? "cam" : "fallback");
  }

  function openRecent() {
    before.current = view;
    setView("recent");
  }

  const script = beats.map((b, i) => <p key={i}>{b.text}</p>);

  return (
    <main className="phone-shell">
      {view === "intro" && (
        <section className="ph" data-ph="0"><div className="ph-card"><b>Verbalore</b><p>Allow the camera and microphone so you can record your video.</p><p>Your video is private. Only you and your computer can see it.</p><button className="btn primary lg" id="phAllow" onClick={allow}>Allow and continue</button></div></section>
      )}

      {view === "fallback" && (
        <section className="ph" data-ph="0">
          <div className="ph-card">
            <b>{title}</b>
            {camError ? <p className="ph-error" role="alert">{camError}</p> : <p>This link is not https, so the live teleprompter is not available. Read the script, then record with your phone&apos;s camera.</p>}
            <div className="ph-scriptbox">{script}</div>
            <label className="btn primary lg">Open the camera and record<input type="file" accept="video/*" capture="user" onChange={(e) => onFile(e.target.files?.[0])} /></label>
          </div>
        </section>
      )}

      {view === "cam" && (
        <section className="ph" data-ph="1">
          <div className="ph-cam"><video ref={video} autoPlay muted playsInline /><i className="oval"></i></div>
          <div className="ph-top"><span id="phState" className={state.rec ? "rec" : undefined}>{state.text}</span><span id="phTime">{fmt(time)}</span></div>
          <div className="ph-script" id="phScript" onClick={() => recording && tw.current && (tw.current.paused() ? tw.current.resume() : tw.current.pause())}><div id="phScrollIn" ref={scrollIn}>{script}</div></div>
          <div className="ph-bar"><button className={"ph-rec" + (recording ? " on" : "")} id="phRec" aria-label={recording ? "Stop recording" : "Start recording"} onClick={onRec}></button><span id="phHint">{recording ? "Tap to stop." : "Tap to record"}</span></div>
          <div className="ph-count" id="phCount" hidden={count === null}>{count ?? 3}</div>
          <button className="ph-recent" id="phRecentBtn" aria-label="Recent on this phone" onClick={openRecent}>Recent<b id="phRecentN">{recent.length}</b></button>
        </section>
      )}

      {view === "review" && take && (
        <section className="ph" data-ph="3"><div className="ph-card"><b>Keep this video?</b><video src={take.url} controls playsInline /><p id="phLen">{take.note}</p><div className="ph-actions"><button className="btn primary lg" id="phUse" onClick={() => send()}>Use it</button><button className="btn sec lg" id="phAgain" onClick={again}>Record again</button></div></div></section>
      )}

      {view === "upload" && (
        <section className="ph" data-ph="4"><div className="ph-up"><div className="ph-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="#243042" strokeWidth="10" /><circle id="phRing" cx="50" cy="50" r="42" fill="none" stroke="#fb923c" strokeWidth="10" strokeLinecap="round" strokeDasharray="264" style={{ strokeDashoffset: 264 * (1 - pct / 100) }} /></svg><span className="pct" id="phPct">{Math.round(pct)}%</span></div><b>Sending to your computer</b><p id="phUpMsg" className={upError ? "ph-error" : undefined} role={upError ? "alert" : undefined}>{upError || "Keep this screen open."}</p>
          {upError && <div className="ph-actions"><button className="btn sec lg" onClick={() => send()}>Try again</button><button className="btn sec lg" onClick={again}>Record again</button></div>}
        </div></section>
      )}

      {view === "sent" && (
        <section className="ph" data-ph="5"><div className="ph-card"><b>Sent</b><p>Your video is on your computer. Go back to it to edit and post.</p><div className="ph-actions"><button className="btn sec lg" id="phMore" onClick={again}>Record another</button><button className="btn sec lg" id="phRecentBtn2" onClick={openRecent}>Recent on this phone</button></div></div></section>
      )}

      {view === "recent" && (
        <section className="ph" data-ph="6"><div className="ph-list"><div className="ph-listhead"><b>Recent on this phone</b><button className="phback" id="phBack" onClick={() => setView(before.current === "recent" ? "cam" : before.current)}>Back</button></div><div id="phList" className="ph-items">
          {recent.length ? recent.map((q) => (
            <div className="phrow" key={q.id}><span className="phthumb"></span><div className="phinfo"><b>{q.t}</b><small>{fmt(q.sec)}, {when(q.at)}</small></div><span className="phst ok">Sent</span></div>
          )) : <p style={{ color: "#c8d1dc", padding: "1rem .2rem" }}>Nothing recorded on this phone yet.</p>}
        </div></div></section>
      )}
    </main>
  );
}
