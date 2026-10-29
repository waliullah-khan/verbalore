import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanLinkedIn, isAdmin, isEmail, isInviteToken } from "./access";

test("only a real LinkedIn profile is accepted, and it is normalised", () => {
  assert.equal(cleanLinkedIn("https://www.linkedin.com/in/jane-doe/"), "https://www.linkedin.com/in/jane-doe");
  assert.equal(cleanLinkedIn("linkedin.com/in/jane-doe?utm=x"), "https://linkedin.com/in/jane-doe");
  assert.equal(cleanLinkedIn("http://uk.linkedin.com/in/jane"), "https://uk.linkedin.com/in/jane");
  assert.equal(cleanLinkedIn("https://www.linkedin.com/company/acme"), "https://www.linkedin.com/company/acme");
  for (const bad of [
    "", "javascript:alert(1)", "https://evil.com/in/jane", "https://linkedin.com.evil.com/in/jane",
    "https://www.linkedin.com/", "https://www.linkedin.com/feed/", "https://linkedin.com/in/", "not a link",
    "https://www.linkedin.com/in/a b", `https://www.linkedin.com/in/${"a".repeat(300)}`,
  ]) {
    assert.equal(cleanLinkedIn(bad), null, bad);
  }
});

test("email check", () => {
  assert.equal(isEmail("jane@company.com"), true);
  assert.equal(isEmail("jane@company"), false);
  assert.equal(isEmail("jane company@x.com"), false);
});

test("admins come only from the environment and match without regard to case", () => {
  process.env.ADMIN_EMAILS = " Boss@Example.com , second@example.com";
  assert.equal(isAdmin("boss@example.com"), true);
  assert.equal(isAdmin("SECOND@example.com"), true);
  assert.equal(isAdmin("other@example.com"), false);
  assert.equal(isAdmin(null), false);
  process.env.ADMIN_EMAILS = "";
  assert.equal(isAdmin("boss@example.com"), false);
});

test("an invite token is 48 hex characters", () => {
  assert.equal(isInviteToken("a".repeat(48)), true);
  assert.equal(isInviteToken("a".repeat(47)), false);
  assert.equal(isInviteToken("../../etc/passwd"), false);
});
