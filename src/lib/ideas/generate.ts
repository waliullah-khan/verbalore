import type { SupabaseClient } from "@supabase/supabase-js";
import { collectAll } from "../research/collectors";
import { balance, dedupe, scorePosts } from "../research/score";
import type { Post } from "../research/types";
import { jevDecide, pickOne } from "../jev";
import { completeJson } from "../llm";
import { buildVoiceProfile, type VoiceProfile } from "../brain/voice";
import { playbook, profileFor, type Playbook, type UseCaseId } from "../usecases";
import { buildScript, type Evidence, type Idea, type Reference } from "./types";

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
  posts.forEach((p, i) => {
    questions[`p${i}`] = {
      type: "choice",
      instructions: `Is this post useful source material for a short video by someone in this niche: ${ws.niche}? The audience is: ${ws.icp}`,
      criteria: { relevant: "The post discusses this niche, its problems, tactics, tools or results", off_topic: "The post is about something unrelated, personal, or spam" },
    };
  });
  const result = await jevDecide({ posts: posts.map((p, i) => ({ id: `p${i}`, title: p.title, text: p.text.slice(0, 280) })) }, questions, 8000);

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
    const body = [
      `People are reacting to it on ${p.platform} right now, and most of the advice is the same recycled tip.`,
      ws.offer,
      proof,
    ].filter(Boolean);
    return {
      angle: `React to the ${p.platform} conversation about "${short}"`,
      hook,
      why_now: `It is one of the most engaged ${p.platform} posts in your niche this month.`,
      score: Math.round((p.score ?? 0.5) * 100),
      evidence: [toEvidence(p)],
      reference: null,
      script: buildScript(pb.formats[i % pb.formats.length].name, hook, body, "Follow for one play like this every day."),
    };
  });
}

type Draft = {
  angle: string; hook: string; why_now: string; evidence_ids: string[]; method: string; body: string[]; cta: string;
  reference_structure?: { hook: string; body: string[]; cta: string };
};

async function writeWithModel(ws: Workspace, profile: Profile, pb: Playbook, voice: VoiceProfile, brain: string, posts: Post[], count: number): Promise<Draft[]> {
  const system = [
    `You write short-form video ideas and scripts for ${ws.name}.`,
    `What they sell: ${profile.offer}. Their audience: ${profile.icp}.`,
    `Content type: ${pb.label}. Use these script formats, one per idea where they fit:\n${pb.formats.map((f) => `- ${f.name}: ${f.pattern}`).join("\n")}`,
    `Hook patterns that work for this audience: ${pb.hooks.join(" | ")}`,
    `Their voice: ${voice.tone}. Sentences average ${voice.avgSentenceWords} words. Rules: ${voice.rules.join("; ")}.`,
    "Use only facts from the brain notes. Do not invent statistics or customers.",
    "Each script is 30 to 45 seconds spoken: a hook (one sentence, result first), two or three body lines, one CTA. Plain words, no hype, no emojis.",
    `Return JSON: {"ideas":[{"angle","hook","why_now","evidence_ids":[post ids],"method":"the script format name you used","body":[strings],"cta","reference_structure":{"hook":"how the best evidence post opens","body":["its beats"],"cta":"how it ends"}}]}. Write exactly ${count} ideas, each built on different posts.`,
  ].join("\n");
  const user = `BRAIN NOTES:\n${brain}\n\nPOSTS (id | platform | engagement | title | text):\n${posts
    .map((p) => `${p.id} | ${p.platform} | ${Math.round(p.engagement)} | ${p.title} | ${p.text.slice(0, 240)}`)
    .join("\n")}`;
  const out = await completeJson<{ ideas: Draft[] }>([{ role: "system", content: system }, { role: "user", content: user }]);
  return out.ideas ?? [];
}

export async function generateIdeas(db: SupabaseClient, ws: Workspace, count = 5, useCase: UseCaseId = "general") {
  const notes: string[] = [];
  const pb = playbook(useCase);
  const profile = profileFor(ws, useCase);
  const topic = profile.topic || profile.offer;

  const results = await collectAll(topic);
  results.forEach((r) => {
    if (r.usedFixture) notes.push(`${r.platform}: sample data${r.error ? ` (${r.error})` : ""}`);
  });
  let pool = scorePosts(dedupe(results.flatMap((r) => r.posts)));
  const relevant = await filterRelevant(profile, pool);
  pool = relevant.length >= count ? relevant : pool;
  const top = balance(pool, 4, 20);

  const [{ data: docs }, voice] = await Promise.all([
    db.from("vl_brain_docs").select("title,content").eq("workspace_id", ws.id).order("created_at"),
    buildVoiceProfile(db, ws.id),
  ]);
  const brain = (docs ?? []).map((d) => `# ${d.title}\n${d.content}`).join("\n\n").slice(0, 6000);
  const proof = (docs ?? []).find((d) => /proof/i.test(d.title))?.content.split(/(?<=\.)\s/)[0] ?? "";

  let ideas: Idea[] = [];
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const drafts = await writeWithModel(ws, profile, pb, voice, brain, top, count);
      const byId = new Map(top.map((p) => [p.id, p]));
      ideas = await Promise.all(
        drafts.slice(0, count).map(async (d) => {
          const ev = d.evidence_ids.map((id) => byId.get(id)).filter((p): p is Post => !!p);
          const evidence = (ev.length ? ev : top.slice(0, 2)).map(toEvidence);
          const refStruct = d.reference_structure ?? { hook: d.hook, body: d.body, cta: d.cta };
          const reference = await chooseReference(d.angle, evidence, refStruct);
          return {
            angle: d.angle,
            hook: d.hook,
            why_now: d.why_now,
            score: Math.round(((ev.reduce((a, p) => a + (p.score ?? 0), 0) / Math.max(1, ev.length)) || 0.5) * 100),
            evidence,
            reference,
            script: buildScript(d.method || "Direct", d.hook, d.body, d.cta),
          };
        })
      );
    } catch (err) {
      notes.push(`writer failed, used templates: ${(err as Error).message}`);
    }
  } else {
    notes.push("OPENROUTER_API_KEY not set: scripts use templates");
  }
  if (!ideas.length) {
    ideas = fallbackIdeas(profile, pb, top, proof, count);
    for (const idea of ideas) idea.reference = await chooseReference(idea.angle, idea.evidence, null);
  }
  return { ideas: ideas.sort((a, b) => b.score - a.score), notes };
}

// Jev picks the single most relevant example to show next to the idea.
async function chooseReference(angle: string, evidence: Evidence[], structure: Reference["structure"] | null): Promise<Reference | null> {
  const withId = evidence.map((e, i) => ({ ...e, id: `e${i}` }));
  if (!withId.length) return null;
  const { pick, viaJev } = await pickOne(
    `Which post is the best example to learn the hook and structure from for a video about: ${angle}`,
    { angle, candidates: withId.map((e) => ({ id: e.id, platform: e.platform, title: e.title, engagement: e.engagement })) },
    withId,
    Object.fromEntries(withId.map((e) => [e.id, `${e.platform}: ${e.title.slice(0, 100)}`]))
  );
  const { id: _id, ...ev } = pick; // eslint-disable-line @typescript-eslint/no-unused-vars
  return {
    ...ev,
    why: viaJev ? "Closest match to your angle among the high-engagement posts." : "Highest engagement among the evidence.",
    viaJev,
    structure: structure ?? { hook: ev.title, body: [], cta: "" },
  };
}

export async function saveIdeas(db: SupabaseClient, workspaceId: string, ideas: Idea[], useCase: UseCaseId = "general") {
  const rows = ideas.map((i) => ({ ...i, workspace_id: workspaceId, use_case: useCase, structure: i.reference?.structure ?? null }));
  const { data, error } = await db.from("vl_ideas").insert(rows).select("id");
  if (error) throw error;
  return data;
}
