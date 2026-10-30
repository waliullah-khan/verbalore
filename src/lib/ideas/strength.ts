// The design sorts every idea into a strength: epic, rare or common. Here it comes from the idea's real score.
export type Strength = "epic" | "rare" | "common";

export const STRENGTH: Record<Strength, { label: string; rar: string; atk: number }> = {
  epic: { label: "Strong idea", rar: "Epic", atk: 180 },
  rare: { label: "Good idea", rar: "Rare", atk: 135 },
  common: { label: "Fair idea", rar: "Common", atk: 100 },
};

export const strengthOf = (score: number): Strength => (score >= 80 ? "epic" : score >= 55 ? "rare" : "common");

// "Why now" text reads as a sentence, so it needs a full stop before the source count follows it.
export const sentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);
