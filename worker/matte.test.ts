import { test } from "node:test";
import assert from "node:assert/strict";
import { RVM_VERSION, cachedPath, dailyLimit, decideMatte, mergeArgs, redact, runPrediction, type Deps, type MatteInput } from "./matte";

const base: MatteInput = { cached: false, hasToken: true, secs: 30, usedToday: 0, dailyLimit: 10, admin: false };

test("an existing cutout is always reused, even with no token or an exhausted allowance", () => {
  assert.deepEqual(decideMatte({ ...base, cached: true, hasToken: false, usedToday: 99 }), { use: "cached" });
});

test("a fresh cutout needs a token, a clip of a minute or less, and allowance left", () => {
  assert.deepEqual(decideMatte(base), { use: "fresh" });
  assert.deepEqual(decideMatte({ ...base, hasToken: false }), { use: "skip", reason: "no-token" });
  assert.deepEqual(decideMatte({ ...base, secs: 60 }), { use: "fresh" });
  assert.deepEqual(decideMatte({ ...base, secs: 60.5 }), { use: "skip", reason: "too-long" });
  assert.deepEqual(decideMatte({ ...base, secs: 0 }), { use: "skip", reason: "no-duration" });
  assert.deepEqual(decideMatte({ ...base, usedToday: 9 }), { use: "fresh" });
  assert.deepEqual(decideMatte({ ...base, usedToday: 10 }), { use: "skip", reason: "daily-limit" });
});

test("admins are not held to the daily limit", () => {
  assert.deepEqual(decideMatte({ ...base, admin: true, usedToday: 500, dailyLimit: 0 }), { use: "fresh" });
  assert.deepEqual(decideMatte({ ...base, dailyLimit: 0 }), { use: "skip", reason: "daily-limit" });
});

test("the daily limit reads the environment, with 10 as the default", () => {
  assert.equal(dailyLimit(undefined), 10);
  assert.equal(dailyLimit(""), 10);
  assert.equal(dailyLimit("abc"), 10);
  assert.equal(dailyLimit("3"), 3);
  assert.equal(dailyLimit("0"), 0);
  assert.equal(dailyLimit("-4"), 0);
  assert.equal(dailyLimit("2.9"), 2);
});

test("the token never survives in a message", () => {
  assert.equal(redact("bad token r8_secret in url", "r8_secret"), "bad token *** in url");
  assert.equal(redact("nothing here"), "nothing here");
});

test("the cache lives beside the recording", () => {
  assert.equal(cachedPath("ws/idea/123.mp4"), "ws/idea/123.mp4.alpha.webm");
});

test("the merge turns the grayscale mask into the clip's alpha channel", () => {
  const args = mergeArgs("clip.mp4", "mask.mp4", "out.webm");
  assert.equal(args[args.indexOf("-i") + 1], "clip.mp4");
  assert.equal(args[args.lastIndexOf("-i") + 1], "mask.mp4");
  assert.equal(args.at(-1), "out.webm");
  assert.ok(args.join(" ").includes("alphamerge"));
  assert.ok(args.includes("libvpx-vp9"));
  assert.equal(args[args.indexOf("-pix_fmt") + 1], "yuva420p");
});

// --- polling, with a fake network and a fake clock ---

type Call = { url: string; method: string; headers: Record<string, string>; body?: string };

function fake(responses: Array<{ status?: number; json?: unknown }>) {
  const calls: Call[] = [];
  const sleeps: number[] = [];
  let t = 0;
  let i = 0;
  const deps: Deps = {
    fetch: (async (url: string, init?: RequestInit) => {
      calls.push({ url: String(url), method: init?.method ?? "GET", headers: (init?.headers ?? {}) as Record<string, string>, body: init?.body as string | undefined });
      const r = responses[Math.min(i++, responses.length - 1)];
      const status = r.status ?? 200;
      return { ok: status >= 200 && status < 300, status, json: async () => r.json } as Response;
    }) as unknown as typeof fetch,
    now: () => t,
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw new Error("aborted");
      sleeps.push(ms);
      t += ms;
    },
  };
  return { deps, calls, sleeps };
}

const created = (status: string, extra: Record<string, unknown> = {}) => ({ json: { id: "p1", status, urls: { get: "https://api.replicate.com/v1/predictions/p1", cancel: "https://api.replicate.com/v1/predictions/p1/cancel" }, ...extra } });

test("it creates the prediction with the token only in the header, then polls with growing delays", async () => {
  const f = fake([created("starting"), { json: { id: "p1", status: "processing" } }, { json: { id: "p1", status: "processing" } }, { json: { id: "p1", status: "succeeded", output: "https://x/mask.mp4" } }]);
  const out = await runPrediction("r8_tok", { input_video: "https://signed" }, f.deps);
  assert.equal(out, "https://x/mask.mp4");
  assert.equal(f.calls[0].method, "POST");
  assert.equal(f.calls[0].url, "https://api.replicate.com/v1/predictions");
  assert.equal(f.calls[0].headers.Authorization, "Bearer r8_tok");
  const body = JSON.parse(f.calls[0].body as string);
  assert.equal(body.version, RVM_VERSION);
  assert.deepEqual(body.input, { input_video: "https://signed" });
  for (const c of f.calls) {
    assert.ok(!c.url.includes("r8_tok"));
    assert.ok(!(c.body ?? "").includes("r8_tok"));
  }
  assert.deepEqual(f.sleeps, [3000, 4500, 6750]);
});

test("a prediction that finishes while the create call waits needs no polling", async () => {
  const f = fake([created("succeeded", { output: ["https://x/m.mp4"] })]);
  assert.equal(await runPrediction("t", {}, f.deps), "https://x/m.mp4");
  assert.equal(f.calls.length, 1);
  assert.equal(f.sleeps.length, 0);
});

test("the delay stops growing at ten seconds", async () => {
  const waiting = { json: { id: "p1", status: "processing" } };
  const f = fake([created("starting"), waiting, waiting, waiting, waiting, waiting, waiting, { json: { id: "p1", status: "succeeded", output: "u" } }]);
  await runPrediction("t", {}, f.deps, { timeoutMs: 10 * 60_000 });
  assert.equal(Math.max(...f.sleeps), 10_000);
});

test("it gives up after the timeout and cancels the prediction to stop the spend", async () => {
  const f = fake([created("starting"), { json: { id: "p1", status: "processing" } }]);
  await assert.rejects(runPrediction("t", {}, f.deps, { timeoutMs: 20_000 }), /timeout/);
  assert.ok(f.calls.some((c) => c.url.endsWith("/cancel") && c.method === "POST"));
});

test("a failed prediction reports why", async () => {
  const f = fake([created("starting"), { json: { id: "p1", status: "failed", error: "out of memory" } }]);
  await assert.rejects(runPrediction("t", {}, f.deps), /failed: out of memory/);
});

test("a busy API is waited out a few times, then reported", async () => {
  const ok = fake([created("starting"), { status: 503 }, { status: 429 }, { json: { id: "p1", status: "succeeded", output: "u" } }]);
  assert.equal(await runPrediction("t", {}, ok.deps), "u");
  const bad = fake([created("starting"), { status: 503 }]);
  await assert.rejects(runPrediction("t", {}, bad.deps, { timeoutMs: 10 * 60_000 }), /poll 503/);
});

test("a rejected request (bad token) is final straight away", async () => {
  await assert.rejects(runPrediction("t", {}, fake([{ status: 401 }]).deps), /create 401/);
  const f = fake([created("starting"), { status: 404 }]);
  await assert.rejects(runPrediction("t", {}, f.deps), /poll 404/);
});

test("an aborted edit stops waiting and cancels", async () => {
  const f = fake([created("starting"), { json: { id: "p1", status: "processing" } }]);
  const stop = new AbortController();
  stop.abort();
  await assert.rejects(runPrediction("t", {}, f.deps, { signal: stop.signal }), /aborted/);
  assert.ok(f.calls.some((c) => c.url.endsWith("/cancel")));
});
