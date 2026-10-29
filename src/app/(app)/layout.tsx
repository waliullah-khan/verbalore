import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";
import { serviceClient } from "@/lib/supabase/service";
import { isAdmin } from "@/lib/access";
import DisplayMenu from "@/components/DisplayMenu";
import NavLink from "@/components/NavLink";

const make: [string, string][] = [["/ideas", "Today"]];
const work: [string, string][] = [
  ["/library", "Library"],
  ["/signals", "Signals"],
  ["/brain", "Brain"],
  ["/settings", "Settings"],
];

async function signOut() {
  "use server";
  await supabaseServer().auth.signOut();
  redirect("/");
}

async function pendingRequests() {
  const db = await serviceClient();
  const { count } = await db.from("vl_access_requests").select("id", { count: "exact", head: true }).eq("status", "pending");
  return count ?? 0;
}

function Group({ label, links }: { label: string; links: [string, string][] }) {
  return (
    <div className="grid gap-0.5">
      <p className="px-3.5 pb-0.5 text-[0.75rem] font-bold uppercase tracking-[0.08em] muted">{label}</p>
      {links.map(([href, text]) => (
        <NavLink key={href} href={href} variant="rail">{text}</NavLink>
      ))}
    </div>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { ws, user } = await currentWorkspace();
  const admin = isAdmin(user.email);
  const pending = admin ? await pendingRequests() : 0;

  return (
    <div className="mx-auto grid min-h-screen max-w-[84rem] gap-8 px-4 md:grid-cols-[15.5rem_minmax(0,1fr)] md:px-6">
      <aside className="hidden md:sticky md:top-0 md:flex md:h-screen md:flex-col md:gap-5 md:overflow-auto md:py-6">
        <div>
          <Link href="/ideas" className="display text-[1.6rem]">Verbalore</Link>
          <p className="muted mt-1 text-sm">{ws.name}{ws.is_demo && " · demo"}</p>
        </div>
        <nav className="grid gap-4" aria-label="Main">
          <Group label="Make a video" links={make} />
          <Group label="Your work" links={work} />
          {admin && (
            <div className="grid gap-0.5">
              <p className="px-3.5 pb-0.5 text-[0.75rem] font-bold uppercase tracking-[0.08em] muted">Admin</p>
              <NavLink href="/admin/access" variant="rail">
                Access requests
                {pending > 0 && <span className="chip" style={{ background: "var(--accent)", color: "var(--accent-ink)", borderColor: "transparent" }}>{pending}</span>}
              </NavLink>
            </div>
          )}
        </nav>
        <form action={signOut} className="mt-auto">
          <button className="muted px-3.5 text-sm underline-offset-4 hover:underline">Sign out</button>
        </form>
      </aside>

      <div className="min-w-0 pb-28 md:pb-16">
        <header className="flex items-center justify-between gap-3 py-4 md:justify-end md:py-5">
          <Link href="/ideas" className="display text-[1.3rem] md:hidden">Verbalore</Link>
          <div className="flex items-center gap-2">
            {admin && pending > 0 && (
              <Link href="/admin/access" className="btn btn-ghost md:hidden">Requests · {pending}</Link>
            )}
            <DisplayMenu />
          </div>
        </header>
        <main>{children}</main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 flex gap-1 border-t px-2 pt-1.5 md:hidden"
        style={{ background: "var(--card)", borderColor: "var(--line)", paddingBottom: "calc(0.4rem + env(safe-area-inset-bottom, 0px))" }}
        aria-label="Main"
      >
        {[...make, ...work].map(([href, text]) => (
          <NavLink key={href} href={href} variant="tab">{text}</NavLink>
        ))}
      </nav>
    </div>
  );
}
