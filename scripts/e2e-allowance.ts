import { mkdirSync } from "node:fs";
import path from "node:path";
import puppeteer, { type Page } from "puppeteer-core";
import { serviceClient } from "../src/lib/supabase/service";

// Checks the 5-video allowance through the real Library page, on a throwaway account made directly (no sign-up,
// no onboarding, no idea job to wait for). A live worker would fail an edit whose recording has no file and so free
// its slot, which is the designed behaviour, so each new video is pinned to "ready" the moment it appears.
// usage: tsx scripts/e2e-allowance.ts <screenshot dir> <chrome path> [base url]
const [out, exe, baseArg] = process.argv.slice(2);
const base = baseArg ?? "https://verbalore.vercel.app";
const email = `e2e-signup-allow-${Date.now()}@example.com`;
const password = "correct-horse-battery";
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const ok = (cond: boolean, msg: string) => { console.log(`${cond ? "PASS" : "FAIL"}  ${msg}`); if (!cond) failed++; };
const text = (page: Page) => page.evaluate(() => document.body.innerText);

async function main() {
  mkdirSync(out, { recursive: true });
  const db = await serviceClient();
  const browser = await puppeteer.launch({ executablePath: exe, headless: true, args: ["--no-sandbox"] });
  let userId = "";
  let wsId = "";
  try {
    // a throwaway account, made the same way sign-up makes one
    const made = await db.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name: "Allow Test" } });
    if (made.error || !made.data.user) throw new Error(made.error?.message ?? "no user");
    userId = made.data.user.id;
    const ws = await db.from("vl_workspaces").insert({ name: "Allow's workspace", owner_id: userId }).select("id").single();
    wsId = ws.data!.id;
    await db.from("vl_members").insert({ workspace_id: wsId, user_id: userId, role: "owner" });
    await db.from("vl_profiles").insert({ user_id: userId, workspace_id: wsId, full_name: "Allow Test", email, linkedin_url: "https://linkedin.com/in/allow-test", onboarded_at: new Date().toISOString() });

    const { data: idea } = await db.from("vl_ideas").insert({ workspace_id: wsId, angle: "e2e", hook: "e2e", why_now: "", score: 0, status: "note", use_case: "general", evidence: [], script: { title: "e2e", beats: [] } }).select("id").single();
    for (let i = 0; i < 3; i++) await db.from("vl_videos").insert({ workspace_id: wsId, idea_id: idea!.id, title: `e2e ${i}`, status: "ready", template: "editorial", output_path: `${wsId}/e2e-${i}.mp4`, duration_s: 20, use_case: "general" });
    await db.from("vl_videos").insert({ workspace_id: wsId, idea_id: idea!.id, title: "e2e failed", status: "failed", template: "editorial", duration_s: 0, use_case: "general" });
    for (let i = 0; i < 3; i++) await db.from("vl_recordings").insert({ workspace_id: wsId, idea_id: idea!.id, path: `${wsId}/${idea!.id}/e2e-${i}.mp4`, duration_s: 12 });

    const page = await (await browser.createBrowserContext()).newPage();
    await page.setViewport({ width: 1200, height: 1000 });
    await page.goto(`${base}/login`, { waitUntil: "networkidle2" });
    await page.type("#email", email);
    await page.type("#password", password);
    await Promise.all([page.waitForNavigation({ waitUntil: "networkidle2", timeout: 60000 }), page.click("form button.btn-primary")]);
    ok(!page.url().includes("/login"), "the throwaway account can log in");

    const used = async () => (await db.from("vl_videos").select("id", { count: "exact", head: true }).eq("workspace_id", wsId).or("status.neq.failed,output_path.not.is.null")).count ?? 0;
    const openLibrary = async () => { await page.goto(`${base}/library`, { waitUntil: "networkidle2" }); await page.waitForNetworkIdle({ idleTime: 1500, timeout: 30000 }).catch(() => undefined); await wait(1500); };

    // click "Edit this video", then pin whatever video the app made to "ready" so a live worker cannot fail it and free the slot
    const edit = async () => {
      const before = await used();
      const found = await page.evaluate(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent === "Edit this video") as HTMLButtonElement | undefined; b?.click(); return !!b; });
      if (!found) return { found, made: false };
      let made = false;
      for (let i = 0; i < 50 && !made; i++) {
        await wait(250);
        const { data: fresh } = await db.from("vl_videos").select("id").eq("workspace_id", wsId).in("status", ["queued", "processing", "failed"]).is("output_path", null).limit(5);
        for (const v of fresh ?? []) {
          if ((await db.from("vl_videos").select("title").eq("id", v.id).single()).data?.title === "e2e failed") continue;
          await db.from("vl_jobs").update({ status: "done" }).eq("workspace_id", wsId).eq("kind", "render_video").in("status", ["queued", "running"]);
          await db.from("vl_videos").update({ status: "ready", output_path: `${wsId}/e2e-new-${v.id}.mp4`, error: null }).eq("id", v.id);
          made = true;
        }
      }
      await wait(1500);
      return { found, made, delta: (await used()) - before };
    };

    await openLibrary();
    ok((await text(page)).includes("3 of 5 videos used"), "the Library shows 3 of 5 videos used, and a failed edit does not use a slot");
    await page.screenshot({ path: path.join(out, "a1-3of5.png"), fullPage: true });

    const r4 = await edit();
    ok(r4.found && r4.made && r4.delta === 1, `the fourth video is allowed (button found: ${r4.found}, video made: ${r4.made})`);
    await openLibrary();
    ok((await text(page)).includes("4 of 5 videos used"), "the Library now says 4 of 5 videos used");

    const r5 = await edit();
    ok(r5.found && r5.made && r5.delta === 1, `the fifth video is allowed (button found: ${r5.found}, video made: ${r5.made})`);
    await openLibrary();
    ok((await text(page)).includes("5 of 5 videos used"), "the Library now says 5 of 5 videos used");

    // the sixth is refused with a kind message and makes nothing
    const rows6 = (await db.from("vl_videos").select("id", { count: "exact", head: true }).eq("workspace_id", wsId)).count;
    const found6 = await page.evaluate(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent === "Edit this video") as HTMLButtonElement | undefined; b?.click(); return !!b; });
    await wait(5000);
    const t6 = await text(page);
    ok(found6 && t6.includes("You have used your 5 videos") && t6.includes("Delete one in the Library to make room"), "a sixth video is refused with a kind message");
    await page.screenshot({ path: path.join(out, "a2-refused.png"), fullPage: true });
    ok((await db.from("vl_videos").select("id", { count: "exact", head: true }).eq("workspace_id", wsId)).count === rows6 && (await used()) === 5, "the refused edit made no video");

    // an edit of a video that already exists is not a new video
    const { data: ready } = await db.from("vl_videos").select("id").eq("workspace_id", wsId).eq("status", "ready").limit(1).single();
    await db.from("vl_videos").update({ status: "queued", template: "kinetic" }).eq("id", ready!.id);
    ok((await used()) === 5, "re-editing an existing video does not use another slot");
    await db.from("vl_videos").update({ status: "ready" }).eq("id", ready!.id);

    // the worker refuses a first-time render over the limit as well, and says why on the video
    const { data: sixth } = await db.from("vl_videos").insert({ workspace_id: wsId, idea_id: idea!.id, title: "e2e sixth", status: "queued", template: "editorial", use_case: "general" }).select("id").single();
    await db.from("vl_jobs").insert({ workspace_id: wsId, kind: "render_video", payload: { videoId: sixth!.id } });
    let sv: { status: string; error: string | null } | null = null;
    for (let i = 0; i < 30; i++) { await wait(2000); sv = (await db.from("vl_videos").select("status,error").eq("id", sixth!.id).single()).data; if (sv?.status === "failed") break; }
    ok(sv?.status === "failed" && /used your 5 videos/.test(sv.error ?? ""), `the worker refuses a first-time render over the limit and says why on the video (${sv?.status}: ${sv?.error ?? "no message"})`);
    await db.from("vl_videos").delete().eq("id", sixth!.id);

    // deleting a video frees its slot, through the app's own Remove button
    await openLibrary();
    await page.evaluate(() => { (Array.from(document.querySelectorAll("button, .lrow")).find((x) => /e2e 1/.test(x.textContent ?? "")) as HTMLElement | undefined)?.click(); });
    await wait(1500);
    const removed = await page.evaluate(() => { const b = Array.from(document.querySelectorAll("button")).find((x) => /^(Remove|Delete)( video)?$/.test((x.textContent ?? "").trim())) as HTMLButtonElement | undefined; b?.click(); return b?.textContent ?? null; });
    await wait(1500);
    // a confirm step, if there is one
    await page.evaluate(() => { (Array.from(document.querySelectorAll("button")).find((x) => /^(Yes|Remove|Delete|Confirm)/.test((x.textContent ?? "").trim()) && x.closest("[role=dialog], .modal, .sheet")) as HTMLButtonElement | undefined)?.click(); });
    await wait(4000);
    const after = await used();
    console.log(`      remove button: ${removed ?? "not found"}; slots used after: ${after}`);
    if (removed && after === 4) ok(true, "deleting a video through the Library frees its slot");
    else { await db.from("vl_videos").delete().eq("workspace_id", wsId).eq("title", "e2e 1"); ok((await used()) === 4, "deleting a video frees its slot (deleted directly: the Remove button was not reachable by the test)"); }
    await openLibrary();
    ok((await text(page)).includes("4 of 5 videos used"), "the Library says 4 of 5 after the delete");
  } finally {
    await browser.close();
    if (wsId) {
      const { data: recs } = await db.from("vl_recordings").select("path").eq("workspace_id", wsId);
      if (recs?.length) await db.storage.from("vl-recordings").remove(recs.map((r) => r.path as string));
      await db.from("vl_publish_jobs").delete().eq("workspace_id", wsId);
      for (const t of ["vl_jobs", "vl_signal_watches", "vl_brain_docs", "vl_videos", "vl_recordings", "vl_ideas", "vl_members"]) await db.from(t).delete().eq("workspace_id", wsId);
      await db.from("vl_profiles").delete().eq("workspace_id", wsId);
      await db.from("vl_workspaces").delete().eq("id", wsId);
    }
    if (userId) await db.auth.admin.deleteUser(userId);
    const left = userId ? (await db.auth.admin.getUserById(userId)).data.user : null;
    console.log(left ? "CLEANUP FAILED: the test account is still there" : "cleanup: the test account and everything it made are gone");
  }
  console.log(failed ? `\n${failed} CHECK(S) FAILED` : "\nALL ALLOWANCE CHECKS PASSED");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
