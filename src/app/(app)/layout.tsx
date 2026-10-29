import Link from "next/link";
import { redirect } from "next/navigation";
import { currentWorkspace } from "@/lib/workspace";
import { supabaseServer } from "@/lib/supabase/server";

const nav = [
  ["/ideas", "Today"],
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

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { ws } = await currentWorkspace();
  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-6 px-5 py-6 sm:px-8 md:flex-row">
      <aside className="md:w-52 md:shrink-0">
        <div className="flex items-start justify-between md:block">
          <div>
            <Link href="/ideas" className="display text-2xl">Verbalore</Link>
            <p className="muted mt-1 text-sm">{ws.name}{ws.is_demo && " · demo"}</p>
          </div>
          <form action={signOut} className="md:hidden">
            <button className="muted py-1 text-sm underline-offset-4 hover:underline">Sign out</button>
          </form>
        </div>
        <nav className="-mx-5 mt-4 flex gap-1 overflow-x-auto px-5 sm:-mx-8 sm:px-8 md:mx-0 md:mt-6 md:flex-col md:px-0">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm hover:bg-[var(--paper-2)]">{label}</Link>
          ))}
        </nav>
        <form action={signOut} className="mt-6 hidden md:block">
          <button className="muted px-3 text-sm underline-offset-4 hover:underline">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 pb-20">{children}</main>
    </div>
  );
}
