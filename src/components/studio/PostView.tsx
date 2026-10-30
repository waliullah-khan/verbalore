"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { SplitText } from "gsap/SplitText";
import Sticker from "./Sticker";
import { toast } from "./toast";
import { fmtClock, gradientOf, themeName } from "./EditThemes";
import { shorten } from "@/lib/publish/captions";
import { afterPost, connectAccounts, prepareNote, publishStatus, sendNote, startPost } from "@/app/(app)/library/actions";
import type { Contact, PlatformCard, PublishState } from "@/app/(app)/library/types";

gsap.registerPlugin(SplitText);

type Video = { id: string; title: string; template: string; duration: number; url: string; ideaId: string | null };
type Row = { name: string; state: string };
type Done = { head: string; sub: string; late: boolean; streak: Awaited<ReturnType<typeof afterPost>> | null };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const FINAL = ["published", "simulated", "scheduled", "partial"];

// 6:40 pm today, or tomorrow when that has passed
function evening() {
  const d = new Date();
  d.setHours(18, 40, 0, 0);
  if (d.getTime() < Date.now() + 60_000) d.setDate(d.getDate() + 1);
  return d;
}

const stateOf = (s: PublishState, id: string, scheduled: boolean) => {
  const r = s.results[id];
  if (s.status === "queued") return "Waiting";
  if (r?.success === false) return "Failed";
  if (FINAL.includes(s.status)) return scheduled || s.status === "scheduled" ? "Scheduled" : "Posted";
  return r?.success ? (scheduled ? "Scheduled" : "Posted") : "Sending";
};

export default function PostView({ video, platforms, captions, contacts, demo, canPost }: { video: Video; platforms: PlatformCard[]; captions: Record<string, string>; contacts: Contact[]; demo: boolean; canPost: boolean }) {
  const [tab, setTab] = useState<"social" | "note">("social");
  const [on, setOn] = useState<Record<string, boolean>>(() => Object.fromEntries(platforms.map((p) => [p.id, p.connected && ["linkedin", "youtube", "instagram"].includes(p.id)])));
  const [caps, setCaps] = useState<Record<string, string>>(() => Object.fromEntries(platforms.map((p) => [p.id, captions[p.id] ?? video.title])));
  const [when, setWhen] = useState<"now" | "best" | "pick">("now");
  const [time, setTime] = useState("");
  const [contact, setContact] = useState(contacts[0]?.id ?? "");
  const [note, setNote] = useState("");
  const [link, setLink] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [prog, setProg] = useState<null | { title: string; rows: Row[] }>(null);
  const [done, setDone] = useState<Done | null>(null);
  const yes = useRef<HTMLButtonElement>(null);

  const chosen = platforms.filter((p) => p.connected && on[p.id]);
  const over = chosen.filter((p) => (caps[p.id] ?? "").length > p.limit);
  const person = contacts.find((c) => c.id === contact);
  const first = person?.name.split(" ")[0] ?? "";
  const message = note || (person ? `Hi ${first}, I made this short video for you. It takes ${Math.max(1, Math.round(video.duration))} seconds.` : "");
  const [c0, c1] = gradientOf(video.template);

  useEffect(() => {
    if (video.ideaId) document.cookie = `vl-project=${video.ideaId}; path=/; max-age=2592000; samesite=lax`;
  }, [video.ideaId]);

  useEffect(() => {
    if (!confirm) return;
    yes.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setConfirm(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [confirm]);

  useEffect(() => {
    if (!done) return;
    const h = document.getElementById("doneH");
    h?.focus();
    if (!h || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const sp = SplitText.create(h, { type: "chars" });
    gsap.from(sp.chars, { y: 24, opacity: 0, stagger: 0.03, duration: 0.4, ease: "back.out(1.6)", onComplete: () => sp.revert() });
  }, [done]);

  const whenText = when === "now" ? "right away" : when === "best" ? (evening().getDate() === new Date().getDate() ? "at 6:40 pm today" : "at 6:40 pm tomorrow") : time ? `on ${time.replace("T", " at ")}` : "at a time you choose";
  const summary =
    tab === "note"
      ? person ? `One video note to ${person.name}. They get a private link.` : "Add a contact on the Signals page to send a note."
      : !canPost ? "Posting is not set up on this server."
      : chosen.length ? over.length ? `${over.map((p) => p.name).join(", ")} ${over.length > 1 ? "have" : "has"} too many characters.` : `Posting to ${chosen.length} platform${chosen.length > 1 ? "s" : ""} ${whenText}.` : "Choose at least one platform.";
  const blocked = tab === "social" ? !canPost || chosen.length === 0 || over.length > 0 || (when === "pick" && !time) : !person;

  const scheduledAt = () => (when === "pick" ? new Date(time).toISOString() : when === "best" ? evening().toISOString() : undefined);

  async function copyLink() {
    if (!person) return;
    const r = await prepareNote({ videoId: video.id, contactId: person.id }).catch(() => null);
    if (!r || "error" in r) return toast(r && "error" in r ? r.error : "That did not work.");
    setLink(r.link);
    try {
      await navigator.clipboard.writeText(r.link);
      toast("Link copied");
    } catch {
      toast("Select the link and copy it");
    }
  }

  async function finish(head: string, sub: string, late: boolean) {
    const streak = !late && tab === "social" ? await afterPost().catch(() => null) : null;
    setProg(null);
    setDone({ head, sub, late, streak });
  }

  async function go() {
    setConfirm(false);
    if (tab === "note" && person) {
      setProg({ title: "Posting", rows: [{ name: `Video note to ${person.name}`, state: "Sending" }] });
      const made = await prepareNote({ videoId: video.id, contactId: person.id }).catch(() => null);
      if (!made || "error" in made) { setProg(null); return toast(made && "error" in made ? made.error : "That did not work."); }
      const sent = await sendNote({ noteId: made.noteId, message }).catch(() => ({ error: "That did not work." }));
      if ("error" in sent && sent.error) { setProg(null); setLink(made.link); return toast(sent.error); }
      setProg({ title: "Posting", rows: [{ name: `Video note to ${person.name}`, state: "Posted" }] });
      await sleep(400);
      return finish("Note sent", `${person.name} has your note.`, false);
    }

    const late = when !== "now";
    const names = chosen.map((p) => p.name);
    setProg({ title: late ? "Scheduling" : "Posting", rows: chosen.map((p) => ({ name: p.name, state: "Waiting" })) });
    const r = await startPost({ videoId: video.id, platforms: chosen.map((p) => p.id), captions: caps, when, scheduledAt: scheduledAt() }).catch(() => ({ error: "That did not work. Please try again." }));
    if ("error" in r && r.error) { setProg(null); return toast(r.error); }
    const publishId = (r as { publishId: string }).publishId;

    let last: PublishState | null = null;
    for (const deadline = Date.now() + 90_000; Date.now() < deadline; ) {
      await sleep(1500);
      const s = await publishStatus(publishId).catch(() => null);
      if (!s) continue;
      last = s;
      setProg((p) => p && { ...p, rows: chosen.map((pl) => ({ name: pl.name, state: stateOf(s, pl.id, late) })) });
      if (FINAL.includes(s.status)) break;
      if (s.jobError) { setProg(null); return toast(s.jobError); }
    }
    await sleep(400);
    const finalState = last && FINAL.includes(last.status);
    const failed = last ? chosen.filter((p) => last!.results[p.id]?.success === false).map((p) => p.name) : [];
    const tail = demo ? " This is the demo workspace, so nothing was really posted." : "";
    if (!finalState) return finish("Still sending", `${names.join(", ")} ${names.length > 1 ? "are" : "is"} still going out. The Library shows the result.${tail}`, true);
    if (failed.length) return finish("Partly posted", `${failed.join(", ")} did not go through. The rest did.${tail}`, late);
    return finish(late ? "Scheduled" : "Posted", late ? `${names.join(", ")} will go out as planned. It counts toward your streak when it posts.${tail}` : `${names.join(", ")}. It is live now.${tail}`, late);
  }

  const cText =
    tab === "note"
      ? `Send the video note to ${person?.name ?? "this person"} with your message.`
      : `This will post "${video.title}" to ${chosen.map((p) => p.name).join(", ")} ${when === "now" ? "right away" : when === "best" ? "this evening at 6:40 pm" : "at the time you chose"}. You can delete it later from each platform.`;
  const celebrate = done?.streak;
  const connectBack = `/library/${video.id}/post`;
  const streakKind = useMemo(() => (celebrate && celebrate.day === 7 ? "trophy" : "streak"), [celebrate]);

  return (
    <>
      <section className="screen" data-screen="post">
        <div id="postForm" hidden={!!done}>
          <div className="tabs" role="tablist" id="postTabs" style={{ marginBottom: "1rem" }}>
            <button role="tab" data-t="social" aria-selected={tab === "social"} onClick={() => setTab("social")}>Post to social</button>
            <button role="tab" data-t="note" aria-selected={tab === "note"} onClick={() => setTab("note")}>Send to one person</button>
          </div>
          <div className="postgrid">
            <div id="postLeft">
              {tab === "social" ? (
                <>
                  <div className="when" style={{ marginBottom: "1.25rem" }} role="radiogroup" aria-label="When to post">
                    <label><input type="radio" name="when" value="now" checked={when === "now"} onChange={() => setWhen("now")} /> Post now</label>
                    <label><input type="radio" name="when" value="best" checked={when === "best"} onChange={() => setWhen("best")} /> This evening, 6:40 pm</label>
                    <label><input type="radio" name="when" value="pick" checked={when === "pick"} onChange={() => setWhen("pick")} /> Pick a time</label>
                    {when === "pick" && <input type="datetime-local" id="whenT" value={time} aria-label="Date and time" onChange={(e) => setTime(e.target.value)} />}
                  </div>
                  <div style={{ display: "grid", gap: "1rem" }}>
                    {platforms.map((p) => {
                      const isOn = p.connected && on[p.id];
                      const c = caps[p.id] ?? "";
                      return (
                        <div key={p.id} className={`card plat${isOn ? "" : " off"}`}>
                          <div className="row1">
                            <div>
                              <div className="nm">{p.name}</div>
                              <div className="cnt">{p.connected ? (demo ? p.account : `${p.account}, connected`) : "Not connected"}</div>
                            </div>
                            {p.connected ? (
                              <button className="sw" role="switch" aria-checked={isOn} data-p={p.id} aria-label={`Post to ${p.name}`} onClick={() => setOn((o) => ({ ...o, [p.id]: !o[p.id] }))}>{isOn ? "On" : "Off"}</button>
                            ) : (
                              <form action={connectAccounts}>
                                <input type="hidden" name="back" value={connectBack} />
                                <button className="btn sm" disabled={!canPost} title={canPost ? undefined : "Posting is not set up on this server."}>Connect</button>
                              </form>
                            )}
                          </div>
                          {isOn && (
                            <div className="field" style={{ margin: 0 }}>
                              <label htmlFor={`cap_${p.id}`}>{p.title ? "Title" : "Caption"}</label>
                              <textarea id={`cap_${p.id}`} data-c={p.id} style={p.title ? { minHeight: "3.5rem" } : undefined} value={c} onChange={(e) => setCaps((all) => ({ ...all, [p.id]: e.target.value }))} />
                              <div className="cnt">
                                <span className="mono" id={`cnt_${p.id}`} style={c.length > p.limit ? { color: "var(--warn)" } : undefined}>{c.length}</span> of {p.limit.toLocaleString("en-US")} characters{" "}
                                <button className="btn sm quiet" style={{ marginLeft: ".5rem" }} onClick={() => { setCaps((all) => ({ ...all, [p.id]: shorten(c) })); toast("Shortened"); }}>Make it shorter</button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </>
              ) : (
                <div className="card" style={{ display: "grid", gap: "1rem" }}>
                  <h2>Send a private video note</h2>
                  <p className="muted">One person gets a private link. You will see when they open it.</p>
                  {contacts.length ? (
                    <>
                      <div className="field" style={{ margin: 0 }}>
                        <label htmlFor="ctSel">Send to</label>
                        <select id="ctSel" value={contact} onChange={(e) => { setContact(e.target.value); setNote(""); setLink(""); }}>
                          {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}, {c.title || c.account || "no title"}</option>)}
                        </select>
                      </div>
                      <div className="field" style={{ margin: 0 }}>
                        <label htmlFor="noteT">Message with the video</label>
                        <textarea id="noteT" value={message} onChange={(e) => setNote(e.target.value)} />
                      </div>
                      <div>
                        <span className="lab">Private link</span>
                        <div className="sealed" style={{ marginTop: ".4rem" }}>{link || "The private link is made when you copy it or send the note."}</div>{" "}
                        <button className="btn quiet sm" id="copyLink" style={{ marginTop: ".5rem" }} onClick={copyLink}>Copy link</button>
                      </div>
                    </>
                  ) : (
                    <p className="muted">There is nobody to send to yet. Add a contact on the <Link href="/signals" className="font-bold underline underline-offset-4">Signals</Link> page, then come back.</p>
                  )}
                </div>
              )}
            </div>

            <aside className="sumside">
              <div className="card">
                <div className="sumrow">
                  <div className="thumb" id="pThumb" style={{ background: `linear-gradient(160deg,${c0},${c1})`, position: "relative", overflow: "hidden" }}>
                    <video src={`${video.url}#t=0.4`} preload="metadata" muted playsInline aria-hidden="true" tabIndex={-1} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                    <span style={{ position: "relative", textShadow: "0 1px 4px rgba(0,0,0,.7)" }}>{themeName(video.template)}</span>
                  </div>
                  <div style={{ display: "grid", gap: ".5rem", alignContent: "start" }}>
                    <b id="pTitle">{video.title}</b>
                    <span className="muted mono" id="pLen">{fmtClock(video.duration)} long</span>
                    <ul className="checks" style={{ fontSize: ".9rem" }}><li>Captions on</li><li>Vertical 9:16</li></ul>
                  </div>
                </div>
              </div>
              <div className="card" style={{ display: "grid", gap: ".75rem" }}>
                <div className="lab">Summary</div>
                <p id="pSummary">{summary}</p>
                <button className="btn primary lg" id="reviewPost" disabled={blocked} onClick={() => setConfirm(true)}>{tab === "note" ? "Review and send" : "Review and post"}</button>
              </div>
            </aside>
          </div>
        </div>

        <div className="done" id="postDone" hidden={!done}>
          {done && (
            <>
              <div>
                <h2 id="doneH" tabIndex={-1}>{done.head}</h2>
                <p className="muted" style={{ marginTop: ".4rem" }}>{done.sub}</p>
              </div>
              {celebrate && celebrate.day > 0 && (
                <div className="card celebrate g-on" id="cel">
                  <h3>Day {celebrate.day} of your streak</h3>
                  <p>That is {celebrate.week} of {celebrate.goal} videos this week. {celebrate.week >= celebrate.goal ? "You hit your weekly goal." : ""}</p>
                  <div className="gstrip" style={{ padding: 0, margin: 0, border: 0, boxShadow: "none", background: "none" }}>
                    <Sticker name={streakKind} size={6} enter={0.1} label="Celebration" />
                    <div className="gi g-full"><span>Experience</span><b className="mono" id="xpAdd">{celebrate.xp.toLocaleString("en-US")}</b></div>
                    <div className="gi g-full"><span>Level</span><b className="mono">{celebrate.level}</b></div>
                  </div>
                </div>
              )}
              <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
                <Link className="btn primary lg" href="/library">See it in the Library</Link>
                <Link className="btn lg" id="another" href="/ideas">Make another video</Link>
              </div>
            </>
          )}
        </div>
      </section>

      <div className="modal" id="confirm" hidden={!confirm}>
        <div className="card box" role="dialog" aria-modal="true" aria-labelledby="cTitle">
          <h2 id="cTitle">{tab === "note" ? "Send this note?" : "Post now?"}</h2>
          <p id="cText">{cText}</p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <button className="btn primary lg" id="cYes" ref={yes} onClick={go}>{tab === "note" ? "Send note" : when === "now" ? "Post now" : "Schedule it"}</button>
            <button className="btn lg" id="cNo" onClick={() => setConfirm(false)}>Go back</button>
          </div>
        </div>
      </div>

      <div className="modal" id="progress" hidden={!prog}>
        <div className="card box" role="dialog" aria-modal="true" aria-labelledby="gTitle">
          <h2 id="gTitle">{prog?.title ?? "Working"}</h2>
          <ul className="prog" id="progList">
            {prog?.rows.map((r) => <li key={r.name}><span>{r.name}</span><span className="st">{r.state}</span></li>)}
          </ul>
        </div>
      </div>
    </>
  );
}
