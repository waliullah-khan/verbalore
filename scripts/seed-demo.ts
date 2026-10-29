import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import demo from "../fixtures/demo-workspace.json";
import personas from "../fixtures/personas.json";
import crm from "../fixtures/crm.json";
import sampleSignals from "../fixtures/signals.json";

// Safe to run more than once. It signs in as the demo user, so row level security applies as in the app.
async function main() {
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false } });
  const { data: session, error: authError } = await db.auth.signInWithPassword({
    email: process.env.DEMO_USER_EMAIL!,
    password: process.env.DEMO_USER_PASSWORD!,
  });
  if (authError || !session.user) throw new Error(`demo sign-in failed: ${authError?.message}. Create the demo user first, see the README.`);
  const uid = session.user.id;

  let { data: ws } = await db.from("vl_workspaces").select("*").eq("owner_id", uid).eq("is_demo", true).maybeSingle();
  if (!ws) {
    const res = await db
      .from("vl_workspaces")
      .insert({ ...demo.workspace, owner_id: uid, is_demo: true, digest_email: process.env.DEMO_USER_EMAIL })
      .select()
      .single();
    if (res.error) throw res.error;
    ws = res.data;
    await db.from("vl_members").insert({ workspace_id: ws.id, user_id: uid, role: "owner" });
    console.log("created workspace", ws.id);
  } else {
    console.log("workspace exists", ws.id);
  }

  // Brain documents: Clearpath's belong to the GTM tab, the personas to their own tabs.
  // persona documents are replaced each run, so edits to the fixtures take effect
  const personaTabs = Array.from(new Set(personas.docs.map((d) => d.use_case)));
  await db.from("vl_brain_docs").delete().eq("workspace_id", ws.id).in("use_case", personaTabs);
  const { data: have } = await db.from("vl_brain_docs").select("title,use_case").eq("workspace_id", ws.id);
  const known = new Set((have ?? []).map((d) => `${d.use_case}|${d.title}`));
  const wanted = [
    ...demo.brain.map((d) => ({ ...d, use_case: "gtm" })),
    ...personas.docs,
  ].filter((d) => !known.has(`${d.use_case}|${d.title}`));
  if (wanted.length) {
    const { error } = await db.from("vl_brain_docs").insert(wanted.map((d) => ({ ...d, workspace_id: ws.id })));
    if (error) throw error;
    console.log("brain docs added", wanted.length);
  }

  // the demo agent watches Austin, so the Real estate tab has local records to draw on
  const { data: austin } = await db.from("vl_crm_accounts").select("id").eq("workspace_id", ws.id).eq("source", "place").maybeSingle();
  if (!austin) {
    const { error } = await db.from("vl_crm_accounts").insert({ workspace_id: ws.id, name: "Austin, TX", source: "place", meta: { place: { city: "austin" } } });
    if (error) throw error;
    console.log("watching Austin, TX");
  }

  const { count: accts } = await db.from("vl_crm_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id).neq("source", "place");
  if (!accts) {
    const { data: accounts, error } = await db
      .from("vl_crm_accounts")
      .insert(crm.accounts.map((a) => ({ ...a, workspace_id: ws.id, source: "fixture" })))
      .select();
    if (error) throw error;
    const byName = new Map(accounts.map((a) => [a.name, a.id]));
    const { error: cErr } = await db.from("vl_crm_contacts").insert(
      crm.contacts.map(({ account, ...c }) => ({ ...c, workspace_id: ws.id, account_id: byName.get(account) }))
    );
    if (cErr) throw cErr;
    const { error: sErr } = await db.from("vl_signals").insert(
      sampleSignals.signals.map(({ account, ...s }) => ({
        ...s,
        workspace_id: ws.id,
        account_id: byName.get(account),
        status: "sample",
        source: "news",
        hash: createHash("sha256").update(`${account}|${s.kind}|${s.headline}`).digest("hex").slice(0, 32),
      }))
    );
    if (sErr) throw sErr;
    console.log("crm", crm.accounts.length, "accounts,", crm.contacts.length, "contacts,", sampleSignals.signals.length, "sample signals");
  }
  console.log("seed done");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
