import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

const LINKEDIN = /^(https?:\/\/)?([a-z]{2,3}\.)?linkedin\.com\/(in|pub|company)\/[A-Za-z0-9\-_%.]+\/?(\?.*)?$/i;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const INVITE_DAYS = 14;

export const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

export const isAdmin = (email?: string | null) => !!email && adminEmails().includes(email.toLowerCase());

export const isEmail = (raw: string) => raw.length <= 254 && EMAIL.test(raw);

// The link is shown to an admin as a clickable address, so only a real LinkedIn profile is accepted.
export function cleanLinkedIn(raw: string): string | null {
  const v = raw.trim();
  if (v.length > 200 || !LINKEDIN.test(v)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    return `https://${u.hostname.toLowerCase()}${u.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

export const isInviteToken = (t: string) => /^[a-f0-9]{48}$/.test(t);

export const inviteLink = (token: string) => `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/access/${token}`;

export type AccessRequest = {
  id: string;
  email: string;
  full_name: string;
  linkedin_url: string;
  reason: string;
  status: "pending" | "approved" | "denied";
  invite_token: string | null;
  invite_expires_at: string | null;
  user_id: string | null;
  created_at: string;
  decided_at: string | null;
};

// A new person has no workspace, so approving them creates an empty one they can fill in under Settings.
async function ensureWorkspace(db: SupabaseClient, userId: string, label: string) {
  const { data: member } = await db.from("vl_members").select("workspace_id").eq("user_id", userId).limit(1).maybeSingle();
  if (member) return;
  const { data: ws, error } = await db.from("vl_workspaces").insert({ name: `${label}'s workspace`, owner_id: userId }).select("id").single();
  if (error) throw error;
  const res = await db.from("vl_members").insert({ workspace_id: ws.id, user_id: userId, role: "owner" });
  if (res.error) throw res.error;
}

export async function approveRequest(db: SupabaseClient, id: string): Promise<{ link: string } | { error: string }> {
  const { data: req } = await db.from("vl_access_requests").select("*").eq("id", id).maybeSingle();
  if (!req) return { error: "That request no longer exists." };
  const r = req as AccessRequest;

  let userId = r.user_id;
  if (userId) {
    await db.auth.admin.updateUserById(userId, { ban_duration: "none" });
  } else {
    const made = await db.auth.admin.createUser({ email: r.email, email_confirm: true });
    if (made.data?.user) userId = made.data.user.id;
    else {
      // already has an account, a link for the address returns that user
      const found = await db.auth.admin.generateLink({ type: "magiclink", email: r.email });
      if (found.error || !found.data?.user) return { error: found.error?.message ?? "Could not create the account." };
      userId = found.data.user.id;
    }
  }

  await ensureWorkspace(db, userId, r.full_name.split(" ")[0] || r.email.split("@")[0]);
  const token = randomBytes(24).toString("hex");
  const { error } = await db
    .from("vl_access_requests")
    .update({
      status: "approved",
      invite_token: token,
      invite_expires_at: new Date(Date.now() + INVITE_DAYS * 86_400_000).toISOString(),
      user_id: userId,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return { error: error.message };
  return { link: inviteLink(token) };
}

// Denying someone who was already let in also locks the account, so an old session stops working.
export async function denyRequest(db: SupabaseClient, id: string) {
  const { data: req } = await db.from("vl_access_requests").select("user_id").eq("id", id).maybeSingle();
  if (req?.user_id) await db.auth.admin.updateUserById(req.user_id, { ban_duration: "876000h" });
  await db
    .from("vl_access_requests")
    .update({ status: "denied", invite_token: null, invite_expires_at: null, decided_at: new Date().toISOString() })
    .eq("id", id);
}
