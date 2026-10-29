const CHAT = "https://openrouter.ai/api/v1/chat/completions";

type Msg = { role: "system" | "user" | "assistant"; content: string };

async function call(model: string, messages: Msg[], json: boolean, timeoutMs: number): Promise<string> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error("OPENROUTER_API_KEY is not set");
  const res = await fetch(CHAT, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.7,
      ...(json ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`openrouter ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const text = body.choices?.[0]?.message?.content;
  if (!text) throw new Error("empty completion");
  return text;
}

// The writer model can pass three minutes on long prompts, so it gets a generous window
// and a fast model catches a timeout or provider error.
export async function complete(messages: Msg[], opts: { json?: boolean; fast?: boolean } = {}): Promise<string> {
  const writer = process.env.WRITER_MODEL ?? "deepseek/deepseek-v4-pro";
  const fast = process.env.FAST_MODEL ?? "deepseek/deepseek-v4-flash";
  const first = opts.fast ? fast : writer;
  try {
    return await call(first, messages, !!opts.json, opts.fast ? 45_000 : 150_000);
  } catch (err) {
    if (first === fast) throw err;
    return call(fast, messages, !!opts.json, 60_000);
  }
}

export function parseJson<T>(text: string): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = cleaned.search(/[\[{]/);
  return JSON.parse(start > 0 ? cleaned.slice(start) : cleaned) as T;
}

export async function completeJson<T>(messages: Msg[], opts: { fast?: boolean } = {}): Promise<T> {
  const text = await complete(messages, { json: true, fast: opts.fast });
  try {
    return parseJson<T>(text);
  } catch {
    const retry = await complete(
      [...messages, { role: "assistant", content: text }, { role: "user", content: "That was not valid JSON. Reply with only the JSON." }],
      { json: true, fast: true }
    );
    return parseJson<T>(retry);
  }
}

export async function embed(texts: string[]): Promise<number[][] | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !texts.length) return null;
  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.EMBED_MODEL ?? "openai/text-embedding-3-small", input: texts }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: { embedding: number[] }[] };
    return body.data?.map((d) => d.embedding) ?? null;
  } catch {
    return null;
  }
}
