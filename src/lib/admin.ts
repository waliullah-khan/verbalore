import { supabaseServer } from "./supabase/server";
import { serviceClient } from "./supabase/service";
import { isAdmin } from "./access";

// Every admin action calls this first; hiding a page is not access control.
export async function requireAdmin() {
  const { data } = await supabaseServer().auth.getUser();
  if (!isAdmin(data.user?.email)) throw new Error("not allowed");
  return serviceClient();
}
