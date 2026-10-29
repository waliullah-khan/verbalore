import { test } from "node:test";
import assert from "node:assert/strict";
import { autoWorkspaceName, firstName, isAutoWorkspaceName, linkedinKind, normaliseWebsite, validateSignup } from "./access";
import { allowanceMath, allowanceMessage } from "./allowance";

const good = { name: "  Ada   Lovelace ", email: " Ada@Example.com ", linkedin: "linkedin.com/in/ada-l/", password: "a-fine-passphrase" };

test("a complete sign-up is cleaned up and accepted", () => {
  const r = validateSignup(good);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.value.name, "Ada Lovelace");
    assert.equal(r.value.email, "ada@example.com");
    assert.equal(r.value.linkedin, "https://linkedin.com/in/ada-l");
  }
});

test("each bad field is named so the form can say what is wrong", () => {
  assert.deepEqual(validateSignup({ ...good, name: "   " }), { ok: false, error: "name" });
  assert.deepEqual(validateSignup({ ...good, email: "nope" }), { ok: false, error: "email" });
  assert.deepEqual(validateSignup({ ...good, linkedin: "https://evil.com/in/ada" }), { ok: false, error: "linkedin" });
  for (const password of ["short", "password", "12345678", "aaaaaaaaa", "x".repeat(73), "ada@example.com"]) {
    assert.deepEqual(validateSignup({ ...good, password }), { ok: false, error: "password" }, password);
  }
});

test("a company page is accepted as the LinkedIn link", () => {
  const r = validateSignup({ ...good, linkedin: "https://www.linkedin.com/company/acme" });
  assert.equal(r.ok, true);
  assert.equal(linkedinKind("https://www.linkedin.com/company/acme"), "company");
  assert.equal(linkedinKind("https://www.linkedin.com/in/ada"), "person");
});

test("websites are tidied to an address, and blank means none", () => {
  assert.equal(normaliseWebsite(""), null);
  assert.equal(normaliseWebsite("   "), null);
  assert.equal(normaliseWebsite("acme.com"), "https://acme.com");
  assert.equal(normaliseWebsite("http://WWW.Acme.com/about?x=1"), "http://www.acme.com");
  assert.equal(normaliseWebsite("javascript:alert(1)"), null);
  assert.equal(normaliseWebsite("localhost"), null);
});

test("the starter workspace name comes from the first name and is recognised later", () => {
  assert.equal(firstName("Ada Lovelace"), "Ada");
  assert.equal(autoWorkspaceName("Ada Lovelace"), "Ada's workspace");
  assert.equal(isAutoWorkspaceName("Ada's workspace"), true);
  assert.equal(isAutoWorkspaceName("Clearpath"), false);
});

test("the video allowance: five by default, nothing for admins or the demo to run out of", () => {
  assert.deepEqual(allowanceMath({ used: 4, limit: 5, unlimited: false }), { used: 4, limit: 5, unlimited: false, remaining: 1, canCreate: true });
  assert.equal(allowanceMath({ used: 5, limit: 5, unlimited: false }).canCreate, false);
  assert.equal(allowanceMath({ used: 9, limit: 5, unlimited: false }).remaining, 0);
  assert.equal(allowanceMath({ used: 99, limit: 5, unlimited: true }).canCreate, true);
  assert.match(allowanceMessage(5), /used your 5 videos.*Delete one in the Library/);
});
