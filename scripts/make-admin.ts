import { serviceClient } from "../src/lib/supabase/service";
import { adminEmails, approveRequest } from "../src/lib/access";

// usage: tsx scripts/make-admin.ts
// Gives every address in ADMIN_EMAILS an account and a workspace, and prints a personal sign-in link for each.
async function main() {
  const emails = adminEmails();
  if (!emails.length) throw new Error("Set ADMIN_EMAILS first");
  const db = await serviceClient();

  for (const email of emails) {
    const { data: found } = await db.from("vl_access_requests").select("id").ilike("email", email).maybeSingle();
    let id = found?.id as string | undefined;
    if (!id) {
      const res = await db.from("vl_access_requests").insert({ email, full_name: "Admin", linkedin_url: "" }).select("id").single();
      if (res.error) throw res.error;
      id = res.data.id;
    }
    const result = await approveRequest(db, id!);
    if ("error" in result) throw new Error(result.error);
    console.log(email, "→", result.link);
  }
}
main().catch((e) => { console.error(e.message); process.exit(1); });
