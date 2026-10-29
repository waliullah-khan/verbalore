import type { SupabaseClient } from "@supabase/supabase-js";
import { completeJson } from "../llm";

export type VoiceProfile = {
  tone: string;
  avgSentenceWords: number;
  openers: string[];
  phrases: string[];
  rules: string[];
};

const sentences = (t: string) => t.split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter((s) => s.length > 3);

// Counts only. Works without a model so the profile card is never empty.
export function measureVoice(texts: string[]): VoiceProfile {
  const all = texts.flatMap(sentences);
  const words = all.map((s) => s.split(/\s+/).length);
  const avg = words.length ? Math.round(words.reduce((a, b) => a + b, 0) / words.length) : 12;
  const openers = Array.from(new Set(all.map((s) => s.split(/\s+/).slice(0, 3).join(" ")))).slice(0, 4);
  const grams = new Map<string, number>();
  for (const s of all) {
    const w = s.toLowerCase().replace(/[^a-z' ]/g, "").split(/\s+/);
    for (let i = 0; i < w.length - 2; i++) {
      const g = w.slice(i, i + 3).join(" ");
      grams.set(g, (grams.get(g) ?? 0) + 1);
    }
  }
  const phrases = Array.from(grams.entries()).filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([g]) => g);
  return {
    tone: avg <= 11 ? "Short, direct sentences" : "Plain and conversational",
    avgSentenceWords: avg,
    openers,
    phrases,
    rules: ["Lead with the result", "Plain words", "One clear ask"],
  };
}

export async function buildVoiceProfile(db: SupabaseClient, workspaceId: string): Promise<VoiceProfile> {
  const { data: docs } = await db.from("vl_brain_docs").select("kind,content").eq("workspace_id", workspaceId).in("kind", ["post", "script", "note"]);
  const texts = (docs ?? []).filter((d) => d.kind !== "note" || d.content.length > 200).map((d) => d.content as string);
  let profile = measureVoice(texts);

  if (process.env.OPENROUTER_API_KEY && texts.length) {
    try {
      const refined = await completeJson<Partial<VoiceProfile>>(
        [
          { role: "system", content: "You describe how a person writes, from samples. Reply with JSON: tone (one sentence), phrases (up to 5 phrases they repeat), rules (3 to 5 short style rules). No flattery." },
          { role: "user", content: texts.join("\n\n---\n\n").slice(0, 8000) },
        ],
        { fast: true }
      );
      profile = { ...profile, ...refined, avgSentenceWords: profile.avgSentenceWords, openers: profile.openers };
    } catch {
      // keep the measured profile
    }
  }

  await db.from("vl_voice_profiles").upsert({ workspace_id: workspaceId, profile, updated_at: new Date().toISOString() });
  return profile;
}
