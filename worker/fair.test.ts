import { test } from "node:test";
import assert from "node:assert/strict";
import { pickNext, type QueuedJob, type RunningJob } from "./fair";
import { renderWorkers } from "./render";
import { FINAL_KINDS, PREPARE_KINDS, RENDER_KINDS, handlers } from "./handlers";

const job = (id: string, workspace: string, runAt: number, kind = "render_final", pool?: string): QueuedJob => ({ id, workspace, kind, runAt, pool });

// hand each next job to a free slot, as the lane loops do, and report whose job it was
function drain(queue: QueuedJob[], slots: number, kinds: string[]) {
  const running: RunningJob[] = [];
  const order: string[] = [];
  let left = [...queue];
  while (left.length) {
    for (let s = 0; s < slots && left.length; s++) {
      const next = pickNext(left, running, kinds);
      if (!next) break;
      left = left.filter((q) => q.id !== next.id);
      running.push({ workspace: next.workspace, kind: next.kind });
      order.push(next.workspace!);
    }
    running.length = 0; // the slots finish together; the point is who is picked while others are busy
  }
  return order;
}

test("one workspace's five edits do not make another's single edit wait for all of them", () => {
  const queue = [...[1, 2, 3, 4, 5].map((i) => job(`a${i}`, "A", i)), job("b1", "B", 50)];
  const withTwoSlots = drain(queue, 2, ["render_final"]);
  assert.deepEqual(withTwoSlots.slice(0, 2), ["A", "B"], "B's job is taken in the first round, though it is the newest");
  // one slot at a time: B still goes second, once A has one running
  const running: RunningJob[] = [{ workspace: "A", kind: "render_final" }];
  assert.equal(pickNext(queue.filter((q) => q.id !== "a1"), running, ["render_final"])!.id, "b1");
});

test("with nobody running, the oldest job goes first", () => {
  assert.equal(pickNext([job("late", "B", 9), job("early", "A", 3)], [], ["render_final"])!.id, "early");
});

test("three workspaces are served in turn", () => {
  const queue = ["A", "B", "C"].flatMap((w, wi) => [1, 2].map((i) => job(`${w}${i}`, w, wi * 10 + i)));
  const first3 = drain(queue, 3, ["render_final"]).slice(0, 3);
  assert.deepEqual([...first3].sort(), ["A", "B", "C"]);
});

test("a lane only counts and takes its own kinds", () => {
  const running: RunningJob[] = [{ workspace: "A", kind: "render_video" }, { workspace: "A", kind: "render_video" }];
  // A is busy preparing, which says nothing about the render lane
  assert.equal(pickNext([job("a", "A", 1), job("b", "B", 2)], running, ["render_final"])!.id, "a");
  assert.equal(pickNext([job("p", "A", 1, "render_video")], [], ["render_final"]), null);
});

test("a tagged job is only taken by a worker that asks for its tag", () => {
  const tagged = job("t", "A", 1, "render_final", "loadtest");
  assert.equal(pickNext([tagged], [], ["render_final"]), null);
  assert.equal(pickNext([tagged], [], ["render_final"], "loadtest")!.id, "t");
  assert.equal(pickNext([job("u", "A", 2)], [], ["render_final"], "loadtest"), null);
});

test("Chrome workers per render share the cores and never exceed four unless asked", () => {
  assert.equal(renderWorkers({ RENDER_CONCURRENCY: "1" }, 16), 4, "a big machine is capped");
  assert.equal(renderWorkers({ RENDER_CONCURRENCY: "2" }, 4), 2);
  assert.equal(renderWorkers({ RENDER_CONCURRENCY: "8" }, 4), 1, "never less than one");
  assert.equal(renderWorkers({}, 2), 2);
  assert.equal(renderWorkers({ RENDER_WORKERS: "6", RENDER_CONCURRENCY: "2" }, 4), 6, "an explicit number wins");
});

test("every job kind belongs to exactly one lane", () => {
  const prepare = PREPARE_KINDS.filter((k) => k in handlers);
  const final = FINAL_KINDS.filter((k) => k in handlers);
  const work = Object.keys(handlers).filter((k) => !RENDER_KINDS.includes(k));
  assert.deepEqual(prepare, ["render_video"]);
  assert.deepEqual(final, ["render_final"]);
  for (const k of Object.keys(handlers)) {
    const lanes = [prepare.includes(k), final.includes(k), work.includes(k)].filter(Boolean).length;
    assert.equal(lanes, 1, `${k} is in ${lanes} lanes`);
  }
});
