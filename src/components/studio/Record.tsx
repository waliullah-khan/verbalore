"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import gsap from "gsap";
import { supabaseBrowser } from "@/lib/supabase/browser";
import type { Beat } from "@/lib/ideas/types";
import { savePhoneTake, saveScript, submitRecording } from "@/app/(app)/studio/[id]/actions";
import PhoneModal, { type Arrived, type RecentTake } from "./PhoneModal";
import { durationOf, fmt, lengthCheck, lightCheck, openMeter, sampleLuma, soundCheck, type Check } from "./RecordMeasure";
import "./record.css";

type Mode = "ready" | "rec" | "practice";
type Take = { blob: Blob; url: string; sec: number; checks: Check[]; no: number; file: boolean };
type Progress = { steps: string[]; at: number };

const reduce = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const D = (x: number) => (reduce() ? 0 : x);

export default function RecordScreen({ ideaId, workspaceId, hook, beats, template, noteId, recent }: {
  ideaId: string; workspaceId: string; hook: string; beats: Beat[]; template: string; noteId?: string; recent: RecentTake[];
}) {
  const [mode, setMode] = useState<Mode>("ready");
  const [lines, setLines] = useState(() => beats.map((b) => b.text));
  const [pt, setPt] = useState(1);
  const [mirror, setMirror] = useState(false);
  const [editing, setEditing] = useState(false);
  const [wpm, setWpm] = useState(140);
  const [elapsed, setElapsed] = useState(0);
  const [count, setCount] = useState<number | null>(null);
  const [cam, setCam] = useState({ state: "Ready", rec: false });
  const [camStatus, setCamStatus] = useState<"asking" | "on" | "blocked">("asking");
  const [take, setTake] = useState<Take | null>(null);
  const [showReview, setShowReview] = useState(false);
  const [fileName, setFileName] = useState("");
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [prog, setProg] = useState<Progress | null>(null);
  const [toastMsg, setToastMsg] = useState("");

  const modeRef = useRef<Mode>("ready");
  const stream = useRef<MediaStream | null>(null);
  const meter = useRef<ReturnType<typeof openMeter>>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const el = useRef(0);
  const takeNo = useRef(0);
  const tw = useRef<gsap.core.Tween | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const countIv = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const rms = useRef<number[]>([]);
  const luma = useRef<number[]>([]);
  const live = useRef<HTMLVideoElement>(null);
  const pview = useRef<HTMLDivElement>(null);
  const pinner = useRef<HTMLDivElement>(null);
  const meterEl = useRef<HTMLDivElement>(null);
  const scriptTa = useRef<HTMLTextAreaElement>(null);
  const toastEl = useRef<HTMLDivElement>(null);
  const toastT = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const setM = (m: Mode) => {
    modeRef.current = m;
    setMode(m);
  };

  const toast = useCallback((msg: string) => {
    setToastMsg(msg);
    const t = toastEl.current;
    if (!t) return;
    gsap.killTweensOf(t);
    gsap.to(t, { opacity: 1, y: 0, duration: D(0.2) });
    clearTimeout(toastT.current);
    toastT.current = setTimeout(() => gsap.to(t, { opacity: 0, y: 32, duration: D(0.2) }), 2600);
  }, []);

  // the page is the current project for the Record, Edit and Post steps
  useEffect(() => {
    try {
      document.cookie = `vl-project=${ideaId}; path=/; max-age=2592000; samesite=lax`;
    } catch {
      // the steps simply fall back to Today
    }
  }, [ideaId]);

  const openCamera = useCallback(async () => {
    setCamStatus("asking");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("no camera api");
      const s = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1080 }, height: { ideal: 1920 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = s;
      meter.current?.close();
      meter.current = openMeter(s);
      setCamStatus("on");
    } catch {
      setCamStatus("blocked");
    }
  }, []);

  useEffect(() => {
    openCamera();
    return () => {
      clearInterval(timer.current);
      clearInterval(countIv.current);
      tw.current?.kill();
      stream.current?.getTracks().forEach((t) => t.stop());
      meter.current?.close();
    };
  }, [openCamera]);

  useEffect(() => {
    if (camStatus === "on" && live.current && stream.current) live.current.srcObject = stream.current;
  }, [camStatus]);

  /* ---- teleprompter (the artifact's renderPrompter and buildScroll) ---- */
  const buildScroll = useCallback(() => {
    tw.current?.kill();
    const inner = pinner.current;
    const view = pview.current?.clientHeight;
    if (!inner || !view) return;
    const words = lines.join(" ").split(/\s+/).length;
    const from = view * 0.38;
    const to = -(inner.scrollHeight - view * 0.45);
    gsap.set(inner, { y: from, scaleX: mirror ? -1 : 1 });
    tw.current = gsap.to(inner, { y: to, duration: Math.max(4, (words / wpm) * 60), ease: "none", paused: true });
  }, [lines, wpm, mirror]);

  useLayoutEffect(() => {
    const inner = pinner.current;
    if (!inner || editing) return;
    inner.style.setProperty("--pt", String(pt));
    pview.current?.style.setProperty("--pt", String(pt));
    if (modeRef.current === "ready") buildScroll();
  }, [lines, pt, mirror, wpm, editing, buildScroll]);

  const meterTick = (level: number | null) => {
    meterEl.current?.querySelectorAll("i").forEach((bar) => {
      if (level !== null && !reduce()) gsap.to(bar, { height: 20 + Math.min(1, level * 5 * (0.6 + Math.random() * 0.8)) * 80 + "%", duration: 0.15 });
      else gsap.to(bar, { height: "20%", duration: 0.2 });
    });
  };

  const finishTake = useCallback((blob: Blob, url: string, sec: number, file: boolean) => {
    const checks: Check[] = [];
    if (!file) {
      const s = soundCheck(rms.current);
      const l = lightCheck(luma.current);
      if (s) checks.push(s);
      if (l) checks.push(l);
    }
    checks.push(lengthCheck(sec));
    takeNo.current += file ? 0 : 1;
    setTake((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { blob, url, sec, checks, no: takeNo.current, file };
    });
    setShowReview(true);
    if (!reduce()) requestAnimationFrame(() => gsap.from("#review", { y: 14, opacity: 0, duration: 0.35 }));
  }, []);

  function beginRecorder() {
    const mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/mp4"].find((m) => MediaRecorder.isTypeSupported(m));
    const rec = new MediaRecorder(stream.current!, mime ? { mimeType: mime, videoBitsPerSecond: 6_000_000 } : undefined);
    chunks.current = [];
    rec.ondataavailable = (e) => e.data.size && chunks.current.push(e.data);
    rec.onstop = () => {
      const blob = new Blob(chunks.current, { type: rec.mimeType || "video/webm" });
      finishTake(blob, URL.createObjectURL(blob), (Date.now() - startedAt.current) / 1000, false);
    };
    recorder.current = rec;
    startedAt.current = Date.now();
    rec.start(1000);
  }

  function startRecord(practice: boolean) {
    if (modeRef.current !== "ready" || countIv.current) return;
    if (!practice && camStatus !== "on") return;
    setShowReview(false);
    let n = 3;
    setCount(n);
    setCam({ state: "Get ready", rec: false });
    countIv.current = setInterval(() => {
      n--;
      if (n > 0) {
        setCount(n);
        return;
      }
      clearInterval(countIv.current);
      countIv.current = undefined;
      setCount(null);
      setM(practice ? "practice" : "rec");
      setCam({ state: practice ? "Practice" : "Recording", rec: !practice });
      buildScroll();
      tw.current?.play();
      el.current = 0;
      rms.current = [];
      luma.current = [];
      if (!practice) beginRecorder();
      let tick = 0;
      clearInterval(timer.current);
      timer.current = setInterval(() => {
        el.current += 0.1;
        tick++;
        setElapsed(el.current);
        const level = meter.current?.level() ?? 0;
        meterTick(level);
        if (!practice) {
          rms.current.push(level);
          if (tick % 10 === 0 && live.current) {
            const l = sampleLuma(live.current);
            if (l !== null) luma.current.push(l);
          }
        }
        if (tw.current && tw.current.progress() >= 1) stopRecord();
      }, 100);
    }, reduce() ? 250 : 900);
  }

  function stopRecord() {
    const was = modeRef.current;
    if (was !== "rec" && was !== "practice") return;
    clearInterval(timer.current);
    tw.current?.pause();
    meterTick(null);
    setM("ready");
    setCam({ state: "Ready", rec: false });
    if (was === "rec") {
      if (recorder.current?.state === "recording") recorder.current.stop();
    } else {
      toast("Practice finished");
    }
  }

  function retake() {
    setTake((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });
    setShowReview(false);
    setFileName("");
    setCam({ state: "Ready", rec: false });
    setElapsed(0);
    buildScroll();
  }

  async function onFile(file: File | undefined) {
    if (!file) return;
    setFileName(file.name);
    const { seconds, url } = await durationOf(file);
    finishTake(file, url, seconds, true);
  }

  /* ---- Edit script ---- */
  async function toggleEdit() {
    if (!editing) {
      setEditing(true);
      return;
    }
    const next = (scriptTa.current?.value ?? "").split(/\n\s*\n/).map((l) => l.trim()).filter(Boolean);
    if (next.length < 2) {
      toast("Add at least a hook and a call to action");
      return;
    }
    setEditing(false);
    setLines(next);
    const res = await saveScript({ ideaId, lines: next }).catch(() => ({ ok: false }));
    toast(res.ok ? "Script saved" : "Used for this take, but could not be saved");
  }

  /* ---- Use the take: upload it, queue the real edit, go to the editor ---- */
  async function useTake() {
    if (!take) return;
    const blob = take.blob;
    setProg({ steps: ["Uploading your take", "Starting the edit"], at: 0 });
    const ext = blob.type.includes("mp4") ? "mp4" : blob.type.includes("quicktime") ? "mov" : "webm";
    const path = `${workspaceId}/${ideaId}/${Date.now()}.${ext}`;
    const { error } = await supabaseBrowser().storage.from("vl-recordings").upload(path, blob, { contentType: blob.type || "video/webm", upsert: false });
    if (error) {
      setProg(null);
      toast(/size|large|exceed/i.test(error.message) ? "That video is too large. Record a shorter one." : `Upload failed: ${error.message}`);
      return;
    }
    setProg({ steps: ["Uploading your take", "Starting the edit"], at: 1 });
    try {
      await submitRecording({ ideaId, path, durationS: take.sec, template, noteId });
    } catch {
      setProg(null);
      toast("Could not start the edit. Try again.");
    }
  }

  async function usePhoneTake(a: Arrived) {
    setPhoneOpen(false);
    setProg({ steps: ["Starting the edit"], at: 0 });
    try {
      await submitRecording({ ideaId, path: a.path, durationS: a.durationS, template, noteId });
    } catch {
      setProg(null);
      toast("Could not start the edit. Try again.");
    }
  }

  async function savePhone(a: Arrived) {
    setPhoneOpen(false);
    const res = await savePhoneTake({ ideaId, path: a.path, durationS: a.durationS }).catch(() => ({ ok: false }));
    toast(res.ok ? "Saved to your Library, under From your phone" : "Could not save it. Use it now instead, or try again.");
  }

  const blocked = camStatus === "blocked";
  const reviewTitle = take ? (take.file ? "Your video is ready" : `Take ${take.no} is ready`) : "Take 1 is ready";

  return (
    <section className="screen" data-screen="record">
      <div className="card phonecard"><div><b>Rather record on your phone?</b><p className="muted">Scan a code, record on your phone, and the video appears here ready to edit.</p></div><button className="btn primary" id="usePhone" onClick={() => setPhoneOpen(true)}>Use my phone</button></div>
      <div className="recgrid">
        <div>
          <div className={"cam" + (showReview && take ? " review" : "")} id="cam">
            <video ref={live} className="live" autoPlay muted playsInline hidden={camStatus !== "on" || (showReview && !!take)} />
            {showReview && take && <video src={take.url} controls playsInline />}
            {camStatus !== "on" && (<><i className="head"></i><i className="body"></i></>)}
            <span className="oval"></span>
            <span className={"badge" + (cam.rec ? " rec" : "")} id="camState">{cam.state}</span>
            <span className="time" id="camTime">{fmt(elapsed)}</span>
            <div className="meter" id="meter" ref={meterEl}><i></i><i></i><i></i><i></i><i></i><i></i></div>
            <div className="count" id="count" hidden={count === null}>{count ?? 3}</div>
          </div>
          <p className="muted" style={{ textAlign: "center", fontSize: ".85rem", marginTop: ".5rem" }} role="status">
            {camStatus === "asking" && "Asking for your camera and microphone."}
            {camStatus === "on" && "Your camera and microphone are on."}
            {blocked && "Camera or microphone access was blocked. Allow it in the browser, or upload a video instead. "}
            {blocked && <button className="btn quiet sm" onClick={openCamera}>Try again</button>}
          </p>
          <div className="recbtns">
            <button className="btn primary lg" id="recStart" hidden={mode !== "ready"} disabled={camStatus !== "on"} title={camStatus !== "on" ? "The camera is not available yet" : undefined} onClick={() => startRecord(false)}>Start recording</button>
            <button className="btn lg" id="recStop" hidden={mode === "ready"} onClick={stopRecord}>Stop</button>
            <button className="btn quiet" id="practice" hidden={mode !== "ready"} onClick={() => startRecord(true)}>Practice read-through</button>
          </div>
          <div className="recbtns"><label className="btn quiet sm" htmlFor="upFile" style={{ cursor: "pointer" }}>Upload a video instead</label><input type="file" id="upFile" accept="video/*" style={{ position: "absolute", opacity: 0, width: "1px", height: "1px" }} onChange={(e) => onFile(e.target.files?.[0])} /></div>
          <p className="muted" id="upName" style={{ textAlign: "center", fontSize: ".9rem", marginTop: ".4rem" }}>{fileName && `Chosen: ${fileName}`}</p>
        </div>
        <div className="prompter">
          <div className="card" style={{ padding: "1rem 1.25rem" }}><div className="lab">Script for</div><b id="recIdea">{hook}</b></div>
          <div className="pview" id="pview" aria-label="Teleprompter" ref={pview}>
            {editing ? (
              <textarea id="scriptTa" ref={scriptTa} defaultValue={lines.join("\n\n")} style={{ height: "100%", border: 0, borderRadius: 0, fontSize: "1.05rem", background: "var(--surf2)" }} />
            ) : (
              <>
                <div className="pguide"></div>
                <div className={"pinner" + (mirror ? " mirror" : "")} id="pinner" ref={pinner}>{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
              </>
            )}
          </div>
          <div className="ptools">
            <div className="field" style={{ margin: 0 }}><label htmlFor="wpm">Speed <span className="mono" id="wpmV">{wpm}</span> words a minute</label><input type="range" id="wpm" min={100} max={180} step={5} value={wpm} onChange={(e) => setWpm(+e.target.value)} /></div>
            <div className="field" style={{ margin: 0 }}><span className="lab">Text size</span><div className="seg" id="ptSeg">{([["0.9", "A-"], ["1", "A"], ["1.3", "A+"]] as const).map(([v, t]) => <button key={v} data-v={v} aria-pressed={pt === +v} onClick={() => setPt(+v)}>{t}</button>)}</div></div>
            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}><button className="btn quiet sm" id="mirror" aria-pressed={mirror} onClick={() => setMirror(!mirror)}>Mirror text</button><button className="btn quiet sm" id="editScript" onClick={toggleEdit}>{editing ? "Save script" : "Edit script"}</button></div>
          </div>
          <div className="card review" id="review" hidden={!showReview || !take}>
            <h3 id="revTitle">{reviewTitle}</h3>
            <ul className="checks">
              {take?.checks.map((c, i) => (
                <li key={i} className={c.ok ? undefined : "no"} id={i === take.checks.length - 1 ? "revLen" : undefined}>{c.text}</li>
              ))}
            </ul>
            <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}><button className="btn primary lg" id="useTake" onClick={useTake}>Use this take and edit</button><button className="btn" id="retake" onClick={retake}>Record again</button></div>
          </div>
        </div>
      </div>

      {phoneOpen && (
        <PhoneModal ideaId={ideaId} noteId={noteId} lines={lines} recent={recent} onClose={() => setPhoneOpen(false)} onUse={usePhoneTake} onSave={savePhone} toast={toast} />
      )}

      <div className="modal" hidden={!prog}>
        <div className="card box" role="dialog" aria-modal="true" aria-labelledby="recProgTitle">
          <h2 id="recProgTitle">Editing your video</h2>
          <ul className="prog">
            {prog?.steps.map((s, i) => (
              <li key={s}><span>{s}</span><span className="st">{i < prog.at ? "Done" : i === prog.at ? "Working" : "Waiting"}</span></li>
            ))}
          </ul>
        </div>
      </div>
      <div className="toast" ref={toastEl} role="status" aria-live="polite">{toastMsg}</div>
    </section>
  );
}
