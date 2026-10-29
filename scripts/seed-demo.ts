import { createHash } from "node:crypto";
import { serviceClient } from "../src/lib/supabase/service";
import demo from "../fixtures/demo-workspace.json";
import crm from "../fixtures/crm.json";
import sampleSignals from "../fixtures/signals.json";

async function main() {
  const db = await serviceClient();
  const { data: session } = await db.auth.getUser();
  const uid = session.user?.id;
  if (!uid) throw new Error("not signed in; set DEMO_USER_EMAIL and DEMO_USER_PASSWORD");

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

  const { count: docs } = await db.from("vl_brain_docs").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
  if (!docs) {
    const { error } = await db.from("vl_brain_docs").insert(demo.brain.map((d) => ({ ...d, workspace_id: ws.id })));
    if (error) throw error;
    console.log("brain docs", demo.brain.length);
  }

  const { count: accts } = await db.from("vl_crm_accounts").select("id", { count: "exact", head: true }).eq("workspace_id", ws.id);
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
