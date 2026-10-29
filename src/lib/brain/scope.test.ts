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

import { isPublicHttpUrl } from "./ingest";

test("the server only fetches public web pages", () => {
  assert.equal(isPublicHttpUrl("https://example.com/about"), true);
  assert.equal(isPublicHttpUrl("http://news.site.org/a?b=1"), true);
  for (const bad of [
    "http://localhost:3000/admin", "http://127.0.0.1/", "http://10.0.0.5/x", "http://192.168.1.1/", "http://172.20.0.1/",
    "http://169.254.169.254/latest/meta-data/", "http://[::1]/", "http://8.8.8.8/", "http://intranet.local/", "http://db.internal/",
    "file:///etc/passwd", "ftp://example.com/x", "javascript:alert(1)", "not a url", "http://singlelabel/",
  ]) {
    assert.equal(isPublicHttpUrl(bad), false, bad);
  }
});
