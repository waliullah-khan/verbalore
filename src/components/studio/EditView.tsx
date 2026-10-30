"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import gsap from "gsap";
import { toast } from "./toast";
import { fmtClock, themeOptions, type ThemeOption } from "./EditThemes";
import { applyEditsAction, videoStatus } from "@/app/(app)/library/actions";
import type { EditScene } from "@/app/(app)/library/types";

type Video = { id: string; title: string; status: string; error: string; template: string; duration: number; url: string | null; ideaId: string | null; canRerender: boolean };
type Edit = { headline: string; sub: string; stat: string; items: string };
type Snap = { edits: Edit[]; theme: string };

const KIND: Record<string, string> = { hook: "Title", stat: "Big number", list: "List", tip: "Tip", cta: "Call to action", quote: "Quote", title: "Title", code: "Code", compare: "Comparison", facts: "Facts" };
const WHY_FIXED = "The editor chooses this when it edits the video, so it cannot be changed by hand yet.";

const toEdit = (s: EditScene): Edit => ({ headline: s.headline ?? "", sub: s.sub ?? "", stat: s.stat ?? "", items: (s.items ?? []).join("\n") });

export default function EditView({ video, scenes }: { video: Video; scenes: EditScene[] }) {
  const router = useRouter();
  const vref = useRef<HTMLVideoElement>(null);
  const first = useMemo(() => scenes.map(toEdit), [scenes]);
  const [edits, setEdits] = useState<Edit[]>(first);
  const [theme, setTheme] = useState(video.template);
  const [tab, setTab] = useState<"scene" | "look" | "layers">("scene");
  const [sel, setSel] = useState(0);
  const [t, setT] = useState(0);
  const [total, setTotal] = useState(video.duration || scenes[scenes.length - 1]?.end || 0);
  const [playing, setPlaying] = useState(false);
  const [undo, setUndo] = useState<Snap[]>([]);
  const [redo, setRedo] = useState<Snap[]>([]);
  const [progress, setProgress] = useState<null | { status: string; error: string }>(
    video.status === "queued" || video.status === "processing" ? { status: video.status, error: "" } : null
  );
  const pending = useRef<Snap | null>(null);
  const themes = useMemo(themeOptions, []);

  const snap = useCallback((): Snap => ({ edits: edits.map((e) => ({ ...e })), theme }), [edits, theme]);
  const restore = (s: Snap) => { setEdits(s.edits.map((e) => ({ ...e }))); setTheme(s.theme); };
  const dirty = theme !== video.template || JSON.stringify(edits) !== JSON.stringify(first);

  // the Record and Post steps follow the project being worked on
  useEffect(() => {
    if (video.ideaId) document.cookie = `vl-project=${video.ideaId}; path=/; max-age=2592000; samesite=lax`;
  }, [video.ideaId]);

  const sceneAt = useCallback((time: number) => {
    const i = scenes.findIndex((s) => time < s.end);
    return i < 0 ? Math.max(0, scenes.length - 1) : i;
  }, [scenes]);

  // the playhead follows the real video
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      setT(v.currentTime);
      raf = requestAnimationFrame(tick);
    };
    const onPlay = () => { setPlaying(true); raf = requestAnimationFrame(tick); };
    const onPause = () => { setPlaying(false); cancelAnimationFrame(raf); setT(v.currentTime); };
    const onMeta = () => Number.isFinite(v.duration) && v.duration > 0 && setTotal(v.duration);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onPause);
    v.addEventListener("loadedmetadata", onMeta);
    onMeta();
    return () => {
      cancelAnimationFrame(raf);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onPause);
      v.removeEventListener("loadedmetadata", onMeta);
    };
  }, []);

  useEffect(() => {
    if (playing) setSel(sceneAt(t));
  }, [t, playing, sceneAt]);

  // while the editor works, ask how it is going
  useEffect(() => {
    if (!progress || progress.status === "failed") return;
    const id = setInterval(async () => {
      const s = await videoStatus(video.id).catch(() => null);
      if (!s) return;
      if (s.status === "ready") {
        clearInterval(id);
        setProgress({ status: "ready", error: "" });
        setTimeout(() => { setProgress(null); toast("Edited again"); router.refresh(); }, 600);
      } else if (s.status === "failed") {
        clearInterval(id);
        setProgress({ status: "failed", error: s.error || "The edit did not finish." });
      } else setProgress({ status: s.status, error: "" });
    }, 3000);
    return () => clearInterval(id);
  }, [progress, video.id, router]);

  useEffect(() => {
    if (!progress) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!reduce) gsap.fromTo("#progress .box", { y: 12, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25 });
  }, [progress === null]); // eslint-disable-line react-hooks/exhaustive-deps

  const seek = (time: number) => {
    const v = vref.current;
    if (!v) return;
    v.currentTime = Math.min(Math.max(0, time), total || time);
    setT(v.currentTime);
    setSel(sceneAt(v.currentTime));
  };

  const edit = (patch: Partial<Edit>) => setEdits((all) => all.map((e, i) => (i === sel ? { ...e, ...patch } : e)));
  const focusField = () => { pending.current = snap(); };
  const blurField = () => {
    const before = pending.current;
    pending.current = null;
    if (before && JSON.stringify(before) !== JSON.stringify(snap())) { setUndo((u) => [...u.slice(-39), before]); setRedo([]); }
  };

  const chooseTheme = (k: string) => {
    if (k === theme) return;
    setUndo((u) => [...u.slice(-39), snap()]);
    setRedo([]);
    setTheme(k);
  };

  const doUndo = () => {
    if (!undo.length) return toast("Nothing to undo");
    setRedo((r) => [...r, snap()]);
    restore(undo[undo.length - 1]);
    setUndo((u) => u.slice(0, -1));
    toast("Undone");
  };
  const doRedo = () => {
    if (!redo.length) return toast("Nothing to redo");
    setUndo((u) => [...u, snap()]);
    restore(redo[redo.length - 1]);
    setRedo((r) => r.slice(0, -1));
    toast("Redone");
  };

  const send = async (fresh: boolean) => {
    if (!video.canRerender) return toast("This video has no original recording, so it cannot be edited again");
    if (!fresh && !dirty) return toast("Nothing to apply yet");
    setProgress({ status: "queued", error: "" });
    const r = await applyEditsAction({
      videoId: video.id,
      template: theme,
      fresh,
      edits: fresh ? undefined : edits.map((e) => ({ headline: e.headline, sub: e.sub, stat: e.stat, items: e.items.split("\n").map((x) => x.trim()).filter(Boolean) })),
    }).catch(() => ({ error: "That did not work. Please try again." }));
    if ("error" in r && r.error) {
      setProgress(null);
      toast(r.error);
    }
  };

  const s = scenes[sel];
  const e = edits[sel];
  const can = s ? { stat: s.type === "stat", items: s.type === "list", sub: s.type === "cta" } : { stat: false, items: false, sub: false };
  const tt = total || 1;

  const rows: [string, (sc: EditScene, i: number) => React.ReactNode][] = [
    ["c", (sc) => sc.text.replace(/\s+/g, " ").trim()],
    ["g", (sc) => KIND[sc.type] ?? sc.type],
    ["f", (_sc, i) => `Scene ${i + 1}`],
  ];

  const pv = progress;
  const steps: [string, string][] = [
    ["Waiting for the editor", pv ? (pv.status === "queued" ? "Working" : "Done") : "Waiting"],
    ["Editing your video", pv ? (pv.status === "processing" ? "Working" : pv.status === "ready" ? "Done" : "Waiting") : "Waiting"],
    ["Saving the finished video", pv?.status === "ready" ? "Done" : "Waiting"],
  ];

  return (
    <>
      <section className="screen" data-screen="edit">
        <div className="editgrid">
          <div className="phonewrap">
            <div className="pv" id="pv" data-th={theme} aria-label="Video preview">
              {video.url ? (
                <video
                  ref={vref}
                  src={video.url}
                  playsInline
                  preload="metadata"
                  style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }}
                  aria-label={video.title}
                />
              ) : (
                <div className="pv-gfx" style={{ zIndex: 2 }}>
                  <div className="head" style={{ fontSize: "1.1rem" }}>{video.status === "failed" ? "The edit did not finish" : "Being edited"}</div>
                </div>
              )}
            </div>
            <div className="transport">
              <button className="btn" id="back5" aria-label="Back 5 seconds" onClick={() => seek(t - 5)}>Back 5s</button>
              <button className="btn primary" id="playBtn" onClick={() => { const v = vref.current; if (!v) return; if (v.paused) { if (v.ended || v.currentTime >= total) v.currentTime = 0; v.play().catch(() => undefined); } else v.pause(); }}>{playing ? "Pause" : "Play"}</button>
              <button className="btn" id="fwd5" aria-label="Forward 5 seconds" onClick={() => seek(t + 5)}>Forward 5s</button>
            </div>
            <input className="scrub" type="range" id="scrub" min={0} max={tt} step={0.1} value={Math.min(t, tt)} aria-label="Position in video" onChange={(ev) => { vref.current?.pause(); seek(Number(ev.target.value)); }} />
            <div className="mono muted" id="timeTxt">{fmtClock(t)} / {fmtClock(total)}</div>
          </div>

          <div className="editright">
            <div className="tabs" role="tablist" id="editTabs">
              {(["scene", "look", "layers"] as const).map((k) => (
                <button key={k} role="tab" data-t={k} aria-selected={tab === k} onClick={() => setTab(k)}>{k === "scene" ? "Scene" : k === "look" ? "Look" : "Layers"}</button>
              ))}
            </div>

            <div className="card" id="inspector">
              {tab === "scene" && (s && e ? (
                <>
                  <h3>Scene {sel + 1} of {scenes.length}</h3>
                  <p className="muted" style={{ marginBottom: "1rem" }}>What you say: {s.text.replace(/\s+/g, " ").trim()}</p>
                  <div className="field"><label htmlFor="fHead">Headline on screen</label><input type="text" id="fHead" value={e.headline} maxLength={120} onFocus={focusField} onBlur={blurField} onChange={(ev) => edit({ headline: ev.target.value })} /></div>
                  {can.stat && <div className="field"><label htmlFor="fStat">Big number</label><input type="text" id="fStat" value={e.stat} maxLength={14} onFocus={focusField} onBlur={blurField} onChange={(ev) => edit({ stat: ev.target.value })} /></div>}
                  {can.items ? (
                    <div className="field"><label htmlFor="fItems">List items, one per line</label><textarea id="fItems" value={e.items} onFocus={focusField} onBlur={blurField} onChange={(ev) => edit({ items: ev.target.value })} /></div>
                  ) : (
                    <div className="field">
                      <label htmlFor="fSub">Supporting line</label>
                      <input type="text" id="fSub" value={can.sub ? e.sub : ""} maxLength={60} disabled={!can.sub} title={can.sub ? undefined : "This kind of scene has no supporting line."} placeholder={can.sub ? "Follow for more" : ""} onFocus={focusField} onBlur={blurField} onChange={(ev) => edit({ sub: ev.target.value })} />
                    </div>
                  )}
                  <div className="field">
                    <label htmlFor="fGfx">Graphic</label>
                    <select id="fGfx" disabled title={WHY_FIXED} value="auto" onChange={() => undefined}>
                      <option value="auto">Automatic ({KIND[s.type] ?? s.type})</option>
                      <option value="stat">Big number</option><option value="list">List</option><option value="tip">Tip</option><option value="hook">Title</option><option value="cta">Call to action</option>
                    </select>
                  </div>
                  <div className="field">
                    <span className="lab">Length of this scene</span>
                    <div className="stepbox">
                      <button className="btn sm" id="durM" aria-label="Shorter" disabled title="A scene lasts as long as the words you say in it.">Shorter</button>
                      <output id="durV">{Math.round(s.end - s.start)} seconds</output>
                      <button className="btn sm" id="durP" aria-label="Longer" disabled title="A scene lasts as long as the words you say in it.">Longer</button>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
                    <button className="btn sm" id="mvL" disabled title="Scenes follow the order of your words.">Move earlier</button>
                    <button className="btn sm" id="mvR" disabled title="Scenes follow the order of your words.">Move later</button>
                    <button className="btn sm" id="dup" disabled title="Scenes follow the order of your words.">Duplicate</button>
                    <button className="btn sm danger" id="del" disabled title="Scenes follow the order of your words.">Delete scene</button>
                  </div>
                </>
              ) : (
                <>
                  <h3>No scenes yet</h3>
                  <p className="muted">The scenes appear here once the video has been edited.</p>
                </>
              ))}

              {tab === "look" && (
                <>
                  <h3>Look</h3>
                  <p className="muted" style={{ marginBottom: "1rem" }}>Pick a style for the whole video.</p>
                  <div id="themeScroll" style={{ maxHeight: "26rem", overflowY: "auto", padding: ".25rem", margin: "-.25rem" }}>
                    {([["core", "Everyday looks"], ["more", "More styles"]] as const).map(([g, title]) => {
                      const list = themes.filter((o) => o.group === g);
                      if (!list.length) return null;
                      return (
                        <div key={g} style={g === "more" ? { marginTop: "1rem" } : undefined}>
                          {themes.some((o) => o.group === "more") && <div className="lab" style={{ marginBottom: ".5rem" }}>{title}</div>}
                          <div className="themes" id={g === "core" ? "themeGrid" : undefined}>
                            {list.map((o: ThemeOption) => (
                              <button key={o.id} data-k={o.id} aria-pressed={theme === o.id} onClick={() => chooseTheme(o.id)}>
                                <b>{o.name}</b>
                                <span className="muted" style={{ fontSize: ".85rem" }}>{o.blurb}</span>
                                <span className="sw2"><i style={{ background: o.paper ?? "var(--surf2)" }} /><i style={{ background: o.accent ?? "var(--ink2)" }} /></span>
                              </button>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="muted" style={{ fontSize: ".9rem", marginTop: ".75rem" }}>The video is edited again in the style you pick when you press Apply my changes.</p>
                  <div className="field" style={{ marginTop: "1rem" }}>
                    <label htmlFor="capSel">Caption style</label>
                    <select id="capSel" disabled title={WHY_FIXED} value="bold" onChange={() => undefined}>
                      <option value="bold">Bold with outline</option><option value="clean">Clean on a dark bar</option><option value="word">Highlight each word</option>
                    </select>
                  </div>
                </>
              )}

              {tab === "layers" && (
                <>
                  <h3>Layers</h3>
                  <p className="muted" style={{ marginBottom: "1rem" }}>Layers higher in the list sit on top of the ones below.</p>
                  <div className="layers" id="layerList">
                    {[["captions", "Captions"], ["graphics", "Graphics"], ["footage", "Your footage"]].map(([k, name]) => (
                      <div className="layerrow" key={k} data-k={k}>
                        <b>{name}</b>
                        <span style={{ display: "flex", gap: ".3rem" }}>
                          <button className="btn sm" disabled title={WHY_FIXED} aria-label={`Move ${name} up`}>Up</button>
                          <button className="btn sm" disabled title={WHY_FIXED} aria-label={`Move ${name} down`}>Down</button>
                        </span>
                        <button className="sw" role="switch" aria-checked="true" disabled title={WHY_FIXED}>Shown</button>
                      </div>
                    ))}
                    <div className="layerrow" style={{ gridTemplateColumns: "1fr auto" }}>
                      <b>Music</b>
                      <button className="sw" role="switch" aria-checked="false" disabled title="This edit has no music.">Off</button>
                    </div>
                  </div>
                  <div className="field" style={{ marginTop: "1rem" }}>
                    <label htmlFor="trk">Music track</label>
                    <select id="trk" disabled title="This edit has no music."><option>Warm Open</option></select>
                  </div>
                  <div className="field">
                    <label htmlFor="vol">Music volume <span className="mono" id="volV">0%</span></label>
                    <input type="range" id="vol" min={0} max={100} value={0} disabled title="This edit has no music." readOnly />
                  </div>
                </>
              )}
            </div>

            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap" }}>
              <button className="btn quiet sm" id="undo" onClick={doUndo}>Undo</button>
              <button className="btn quiet sm" id="redo" onClick={doRedo}>Redo</button>
              <button className="btn quiet sm" id="reedit" disabled={!video.canRerender || !!progress} title={video.canRerender ? undefined : "This video has no original recording to edit again."} onClick={() => send(true)}>Edit it for me again</button>
              <button className="btn primary sm" id="apply" disabled={!video.canRerender || !!progress} title={video.canRerender ? (dirty ? undefined : "Change a headline or a style first.") : "This video has no original recording to edit again."} onClick={() => send(false)}>Apply my changes</button>
            </div>
          </div>
        </div>

        <div className="tlwrap">
          <div className="tl">
            <div className="tl-names" id="tlNames">
              {["Time", "Captions", "Graphics", "Footage", "Music"].map((n) => <div key={n}>{n}</div>)}
            </div>
            <div className="tl-area">
              <div className="tl-in" id="tlIn">
                <div className="tl-ruler">
                  {Array.from({ length: Math.floor(total / 5) + 1 }, (_, k) => k * 5).map((sec) => (
                    <span key={sec} style={{ left: `${(sec / tt) * 100}%` }}>{fmtClock(sec)}</span>
                  ))}
                </div>
                {rows.map(([key, label]) => (
                  <div className="tl-row" key={key}>
                    {scenes.map((sc, i) => (
                      <button
                        key={i}
                        className={`blk${i === sel ? " sel" : ""}`}
                        data-i={i}
                        style={{ left: `${(sc.start / tt) * 100}%`, width: `${((sc.end - sc.start) / tt) * 100}%` }}
                        onClick={() => { vref.current?.pause(); setSel(i); seek(sc.start); }}
                      >
                        {label(sc, i)}
                      </button>
                    ))}
                  </div>
                ))}
                <div className="tl-row">
                  <div className="blk music off" style={{ left: 0, width: "100%", cursor: "default", backgroundColor: "var(--surf2)" }}>
                    <span style={{ background: "var(--surf2)", padding: "0 .3rem", borderRadius: ".3rem" }}>No music in this edit</span>
                  </div>
                </div>
                <div className="tl-ph" style={{ left: `${(Math.min(t, tt) / tt) * 100}%` }} />
              </div>
            </div>
          </div>
          <p className="muted" style={{ fontSize: ".9rem", marginTop: ".5rem" }}>Select a block to edit that scene. Total length <span className="mono" id="tlTotal">{fmtClock(total)}</span>.</p>
        </div>

        <div className="editfoot">
          <Link className="btn quiet" href={video.ideaId ? `/studio/${video.ideaId}` : "/ideas"}>Back to recording</Link>
          <Link className="btn primary lg" href={`/library/${video.id}/post`}>Looks good, go to Post</Link>
        </div>
      </section>

      <div className="modal" id="progress" hidden={!progress}>
        <div className="card box" role="dialog" aria-modal="true" aria-labelledby="gTitle">
          <h2 id="gTitle">{progress?.status === "failed" ? "The edit did not finish" : "Editing your video"}</h2>
          {progress?.status === "failed" ? (
            <>
              <p className="muted">{progress.error}</p>
              <button className="btn lg" onClick={() => setProgress(null)}>Close</button>
            </>
          ) : (
            <ul className="prog" id="progList">
              {steps.map(([label, state]) => (
                <li key={label}><span>{label}</span><span className="st">{state}</span></li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </>
  );
}
