// Jev is TypeSafe's typed decision model, called directly on their API. It answers choice / noul / score
// questions over JSON state in ~200 ms. Its confidence ranks answers, it is not a probability,
// so every caller keeps a deterministic fallback for a null or low-confidence result.

const endpoint = () => `${process.env.TYPESAFE_API_BASE ?? "https://api.typesafe.ai"}/v1/systemone`;
export const JEV_MODEL = process.env.JEV_MODEL ?? "jev-latest";

export type JevQuestion =
  | { type: "choice"; instructions: unknown; criteria: Record<string, unknown> }
  | { type: "noul"; instructions: unknown; criteria?: unknown }
  | { type: "score"; instructions: unknown; criteria: unknown[] };

export type JevAnswer =
  | { type: "choice"; choice: string; confidence: number; probabilities: Record<string, number> }
  | { type: "noul"; noul: number }
  | { type: "score"; score: number; confidence: number; probabilities: Record<string, number> };

export interface JevResult {
  answers: Record<string, JevAnswer>;
  costUsd: number;
  latencyMs: number;
}

export async function jevDecide(
  state: unknown,
  questions: Record<string, JevQuestion>,
  timeoutMs = 6000
): Promise<JevResult | null> {
  const key = process.env.TYPESAFE_API_KEY;
  if (!key || !Object.keys(questions).length) return null;
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: JEV_MODEL, state, questions }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { answers?: Record<string, unknown>; usage?: { cost?: number } };
    const answers: Record<string, JevAnswer> = {};
    for (const [id, raw] of Object.entries(body.answers ?? {})) {
      const a = normalize(raw);
      if (a) answers[id] = a;
    }
    return { answers, costUsd: Number(body.usage?.cost ?? 0), latencyMs: Date.now() - t0 };
  } catch {
    return null;
  }
}

function normalize(raw: unknown): JevAnswer | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const probabilities = (a.probabilities && typeof a.probabilities === "object" ? a.probabilities : {}) as Record<string, number>;
  const confidence = typeof a.confidence === "number" ? a.confidence : 0;
  if (a.type === "choice" && typeof a.choice === "string") return { type: "choice", choice: a.choice, confidence, probabilities };
  if (a.type === "noul" && typeof a.noul === "number") return { type: "noul", noul: a.noul };
  if (a.type === "score" && typeof a.score === "number") return { type: "score", score: a.score, confidence, probabilities };
  return null;
}

// Pick one candidate by id. Returns the fallback when Jev is unavailable or unsure.
export async function pickOne<T extends { id: string }>(
  instructions: string,
  state: unknown,
  candidates: T[],
  criteria: Record<string, string>,
  minConfidence = 0.5
): Promise<{ pick: T; viaJev: boolean; confidence: number }> {
  const fallback = { pick: candidates[0], viaJev: false, confidence: 0 };
  if (candidates.length < 2) return fallback;
  const result = await jevDecide(state, { pick: { type: "choice", instructions, criteria } });
  const ans = result?.answers.pick;
  if (!ans || ans.type !== "choice" || ans.confidence < minConfidence) return fallback;
  const found = candidates.find((c) => c.id === ans.choice);
  return found ? { pick: found, viaJev: true, confidence: ans.confidence } : fallback;
}
