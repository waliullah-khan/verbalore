import type { SupabaseClient } from "@supabase/supabase-js";
import { collectAll } from "../research/collectors";
import { balance, dedupe, scorePosts } from "../research/score";
import type { Post } from "../research/types";
import { jevDecide, pickOne } from "../jev";
import { completeJson } from "../llm";
import { buildVoiceProfile, measureVoice, type VoiceProfile } from "../brain/voice";
import { docsForUseCase } from "../brain/scope";
import { austinPosts, loadAustin } from "../signals/sources/austin";
import { playbook, profileFor, type Playbook, type UseCaseId } from "../usecases";
import type { Evidence, Idea, Reference } from "./types";
import { fallbackScript, writeScript } from "../scripts/writer";
import type { WriterInput } from "../scripts/types";

type Workspace = { id: string; name: string; niche: string; offer: string; icp: string; is_demo?: boolean };
type Profile = { niche: string; offer: string; icp: string; topic: string };

const STOP = new Set("the and for with that this from your you are our their have has how what when why who will into about more than just like over".split(" "));
const terms = (s: string) => Array.from(new Set(s.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3 && !STOP.has(w))));

const toEvidence = (p: Post): Evidence => ({
  url: p.url, title: p.title, platform: p.platform, author: p.author, engagement: Math.round(p.engagement), synthetic: p.synthetic,
});

// Keep posts that are about the user's niche. Jev decides when it is available;
// a keyword overlap check is the fallback and also backs up low-confidence answers.
export async function filterRelevant(ws: Pick<Profile, "niche" | "offer" | "icp">, posts: Post[]): Promise<Post[]> {
  const want = terms(`${ws.niche} ${ws.offer} ${ws.icp}`);
  const keyword = (p: Post) => terms(`${p.title} ${p.text}`).filter((t) => want.includes(t)).length > 0;

  const questions: Record<string, { type: "choice"; instructions: string; criteria: Record<string, string> }> = {};
  posts.forEach((_, i) => {
    questions["p" + i] = {
      type: "choice",
      instructions: "Look at post p" + i + " in the state. Would a person working in " + JSON.stringify(ws.niche) + " find it useful as source material for a short video?",
      criteria: {
        relevant: "The post is about " + ws.niche + ", or the problems, tactics, tools or results of " + ws.icp,
        off_topic: "The post is about anything else: personal life, food, entertainment, generic hashtags, giveaways or spam",
      },
    };
  });
  const result = await jevDecide({ niche: ws.niche, audience: ws.icp, posts: posts.map((p, i) => ({ id: "p" + i, title: p.title, text: p.text.slice(0, 280) })) }, questions, 10_000);

  return posts.filter((p, i) => {
    const a = result?.answers[`p${i}`];
    if (a && a.type === "choice" && a.confidence >= 0.6) return a.choice === "relevant";
    return keyword(p);
  });
}

function fallbackIdeas(ws: Profile, pb: Playbook, top: Post[], proof: string, count: number): Idea[] {
  return top.slice(0, count).map((p, i) => {
    const short = p.title.replace(/\s+/g, " ").slice(0, 90);
    const hook = `Everyone is talking about this: ${short}. Here is what they are missing.`;
    const format = pb.formats[i % pb.formats.length];
    return {
      angle: `React to the ${p.platform} conversation about "${short}"`,
      hook,
      why_now: `It is one of the most engaged ${p.platform} posts in your niche this month.`,
      score: Math.round((p.score ?? 0.5) * 100),
      evidence: [toEvidence(p)],
      reference: null,
      script: fallbackScript({
        kind: "idea", structure: format.name, structureGuide: format.pattern, hook, angle: short,
        evidence: [`${p.title}. ${p.text}`], brain: [ws.offer, proof].filter(Boolean).join(" "),
      }),
    };
  });
}

// What a script is told about the voice and the ground rules, shared by every idea written in one run.
const IDEA_RULES = [
  'Posts from platform "permits" are official city records. When you use one of their numbers, quote it exactly and say it comes from city permit records.',
  "Do not describe neighborhoods, commute times, schools or amenities, and do not place an address in a named area, unless a post says so.",
];

type Pitch = { angle: string; hook: string; why_now: string; evidence_ids: string[]; method: string };

// Step one: choose what to make videos about. The scripts themselves are written afterwards by the shared writer.
async function pitchIdeas(ws: Workspace, profile: Profile, pb: Playbook, voice: VoiceProfile, brain: string, posts: Post[], count: number): Promise<Pitch[]> {
  const system = [
    `You choose video ideas for ${ws.name}. You do not write the scripts yet; you pick the angle, the opening line and the format.`,
    `What they sell: ${profile.offer}. Their audience: ${profile.icp}.`,
    `Content type: ${pb.label}. Script formats, use a different one per idea where they fit:\n${pb.formats.map((f) => `- ${f.name}: ${f.pattern}`).join("\n")}`,
    `Hook patterns that work for this audience: ${pb.hooks.join(" | ")}`,
    `Their voice: ${voice.tone}. Sentences average ${voice.avgSentenceWords} words. Rules: ${voice.rules.join("; ")}.`,
    "Use only facts from the brain notes and the posts. Do not invent statistics or customers.",
    ...IDEA_RULES,
    "The hook is result first and 18 words or fewer. why_now says in one sentence what in the posts makes this timely.",
    `Return JSON: {"ideas":[{"angle","hook","why_now","evidence_ids":[post ids, one to three],"method":"the format name you chose"}]}. Write exactly ${count} ideas, each built on different posts.`,
  ].join("\n");
  const user = `BRAIN NOTES:\n${brain}\n\nPOSTS (id | platform | engagement | title | text):\n${posts
    .map((p) => `${p.id} | ${p.platform} | ${Math.round(p.engagement)} | ${p.title} | ${p.text.slice(0, 240)}`)
    .join("\n")}`;
  const out = await completeJson<{ ideas: Pitch[] }>([{ role: "system", content: system }, { role: "user", content: user }]);
  return (out.ideas ?? []).filter((x) => x && x.hook && x.angle);
}

export async function generateIdeas(db: SupabaseClient, ws: Workspace, count = 5, useCase: UseCaseId = "general") {
  const notes: string[] = [];
  const timings: Record<string, number> = {};
  let mark = Date.now();
  const lap = (name: string) => { timings[name] = Date.now() - mark; mark = Date.now(); };
  const pb = playbook(useCase);
  const profile = profileFor(ws, useCase);
  const topic = profile.topic || profile.offer;

  const results = await collectAll(topic);
  results.forEach((r) => {
    if (r.usedFixture) notes.push(`${r.platform}: sample data${r.error ? ` (${r.error})` : ""}`);
  });
  lap("research");
  // Sample posts only stand in when a source is down. Once there is enough live material they are left out.
  const everything = results.flatMap((r) => r.posts);
  // Real estate also draws on the city's own records for any place the workspace watches.
  if (useCase === "real_estate") {
    const { data: places } = await db.from("vl_crm_accounts").select("meta").eq("workspace_id", ws.id).eq("source", "place");
    if ((places ?? []).some((p) => (p.meta as { place?: { city?: string } })?.place?.city === "austin")) {
      try {
        const local = austinPosts(await loadAustin());
        everything.push(...local);
        notes.push(`added ${local.length} Austin permit facts`);
      } catch (e) {
        notes.push(`austin permits unavailable: ${(e as Error).message}`);
      }
    }
  }
  const live = everything.filter((p) => !p.synthetic);
  if (live.length >= 8) notes.push(`using ${live.length} live posts; sample posts left out`);
  let pool = scorePosts(dedupe(live.length >= 8 ? live : everything));
  const relevant = await filterRelevant(profile, pool);
  pool = relevant.length >= count ? relevant : pool;
  const top = balance(pool, 4, 20);
  lap("relevance");

  // each use case writes from its own documents, so a developer tab never quotes the sales playbook
  const { data: allDocs } = await db.from("vl_brain_docs").select("title,content,kind,use_case").eq("workspace_id", ws.id).order("created_at");
  const docs = docsForUseCase(allDocs ?? [], useCase);
  // the stored voice profile describes the workspace's own business; other tabs measure their own posts
  const voice =
    useCase === "gtm" || useCase === "general"
      ? await buildVoiceProfile(db, ws.id)
      : measureVoice(docs.filter((d) => d.kind === "post").map((d) => d.content as string));
  const brain = docs.map((d) => `# ${d.title}\n${d.content}`).join("\n\n").slice(0, 6000);
  const proof = docs.find((d) => /proof|results|lessons|decisions/i.test(d.title))?.content.split(/(?<=\.)\s/)[0] ?? "";

  lap("brain");
  let ideas: Idea[] = [];
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const pitches = await pitchIdeas(ws, profile, pb, voice, brain, top, count);
      lap("pitch");
      const byId = new Map(top.map((p) => [p.id, p]));
      const voiceLine = `${voice.tone}. Sentences average ${voice.avgSentenceWords} words. ${voice.rules.join("; ")}.`;
      ideas = await Promise.all(
        pitches.slice(0, count).map(async (pitch) => {
          const ev = pitch.evidence_ids.map((id) => byId.get(id)).filter((p): p is Post => !!p);
          const used = ev.length ? ev : top.slice(0, 2);
          const format = pb.formats.find((f) => f.name.toLowerCase() === String(pitch.method).toLowerCase()) ?? pb.formats[0];
          const input: WriterInput = {
            kind: "idea", structure: format.name, structureGuide: format.pattern, hook: pitch.hook, angle: pitch.angle,
            evidence: used.map((p) => `${p.title}. ${p.text}`), brain, voice: voiceLine, audience: profile.icp, offer: profile.offer, rules: IDEA_RULES,
          };
          const [written, reference] = await Promise.all([writeScript(input), chooseReference(pitch.angle, used, top)]);
          return {
            angle: pitch.angle,
            hook: written.script.beats[0].text,
            why_now: pitch.why_now,
            score: Math.round(((ev.reduce((a, p) => a + (p.score ?? 0), 0) / Math.max(1, ev.length)) || 0.5) * 100),
            evidence: used.map(toEvidence),
            reference,
            script: written.script,
          };
        })
      );
      lap("writer");
    } catch (err) {
      notes.push(`writer failed, used templates: ${(err as Error).message}`);
    }
  } else {
    notes.push("OPENROUTER_API_KEY not set: scripts use templates");
  }
  if (!ideas.length) {
    ideas = fallbackIdeas(profile, pb, top, proof, count);
    for (const [n, idea] of ideas.entries()) idea.reference = await chooseReference(idea.angle, [top[n]].filter(Boolean), top);
  }
  lap("references");
  return { ideas: ideas.sort((a, b) => b.score - a.score), notes, timings };
}

type Structure = Reference["structure"];

const firstSentence = (t: string) => t.split(/(?<=[.!?])\s/)[0]?.trim() ?? t;

async function breakdown(p: Post): Promise<Structure> {
  const text = (p.text || p.title).replace(/\s+/g, " ").trim();
  const heuristic: Structure = {
    hook: firstSentence(p.title || text).slice(0, 140),
    body: text.length > 160 ? [text.slice(0, 200).replace(/\s\S*$/, "") + "…"] : [],
    cta: /\?\s*$/.test(text) ? "Ends with a question to the audience" : "",
  };
  if (!process.env.OPENROUTER_API_KEY || text.length < 60) return heuristic;
  try {
    const out = await completeJson<Structure>(
      [
        { role: "system", content: 'Break a social post into how it is built. Reply JSON {"hook":"how it opens","body":["its 2 or 3 beats"],"cta":"how it ends or what it asks"}. Describe the structure, quote nothing longer than six words.' },
        { role: "user", content: p.title + "\n" + text.slice(0, 900) },
      ],
      { fast: true }
    );
    return { hook: out.hook || heuristic.hook, body: out.body ?? [], cta: out.cta ?? "" };
  } catch {
    return heuristic;
  }
}

// Jev picks the one post worth learning from. It chooses across the idea's evidence and the best posts
// overall, so there is always something to choose between.
async function chooseReference(angle: string, evidence: Post[], pool: Post[]): Promise<Reference | null> {
  const seen = new Set<string>();
  const candidates: (Post & { id: string })[] = [];
  for (const p of [...evidence, ...pool]) {
    if (seen.has(p.url) || candidates.length >= 8) continue;
    seen.add(p.url);
    candidates.push({ ...p, id: "c" + candidates.length });
  }
  if (!candidates.length) return null;
  const { pick, viaJev } = await pickOne(
    "Which post is the best example to learn the hook and structure from for a short video about: " + angle,
    { angle, candidates: candidates.map((c) => ({ id: c.id, platform: c.platform, title: c.title, engagement: Math.round(c.engagement) })) },
    candidates,
    Object.fromEntries(candidates.map((c) => [c.id, c.platform + ": " + c.title.slice(0, 100)]))
  );
  return {
    ...toEvidence(pick),
    why: viaJev ? "Jev chose it as the closest match to your angle among the strongest posts." : "Highest engagement among the evidence.",
    viaJev,
    structure: await breakdown(pick),
  };
}

export async function saveIdeas(db: SupabaseClient, workspaceId: string, ideas: Idea[], useCase: UseCaseId = "general") {
  const rows = ideas.map((i) => ({ ...i, workspace_id: workspaceId, use_case: useCase, structure: i.reference?.structure ?? null }));
  const { data, error } = await db.from("vl_ideas").insert(rows).select("id");
  if (error) throw error;
  return data;
}
