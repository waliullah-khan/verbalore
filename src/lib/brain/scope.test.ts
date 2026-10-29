import { test } from "node:test";
import assert from "node:assert/strict";
import { docsForUseCase } from "./scope";

const docs = [
  { id: "all", use_case: null },
  { id: "gtm", use_case: "gtm" },
  { id: "dev", use_case: "developers" },
  { id: "re", use_case: "real_estate" },
];

test("an untagged document applies everywhere, a tagged one only to its use case", () => {
  assert.deepEqual(docsForUseCase(docs, "developers").map((d) => d.id), ["all", "dev"]);
  assert.deepEqual(docsForUseCase(docs, "real_estate").map((d) => d.id), ["all", "re"]);
});

test("one use case never sees another's documents", () => {
  assert.equal(docsForUseCase(docs, "developers").some((d) => d.id === "gtm"), false);
  assert.equal(docsForUseCase(docs, "founders").length, 1);
});

test("general content also draws on the GTM documents, which describe the workspace's own business", () => {
  assert.deepEqual(docsForUseCase(docs, "general").map((d) => d.id), ["all", "gtm"]);
});
