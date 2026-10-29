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
        <Link href="/ideas" className="display text-2xl">Verbalore</Link>
        <p className="muted mt-1 text-sm">{ws.name}{ws.is_demo && " · demo"}</p>
        <nav className="mt-6 flex gap-1 overflow-x-auto md:flex-col">
          {nav.map(([href, label]) => (
            <Link key={href} href={href} className="rounded-lg px-3 py-2 text-sm hover:bg-[var(--paper-2)]">{label}</Link>
          ))}
        </nav>
        <form action={signOut} className="mt-6">
          <button className="muted px-3 text-sm underline-offset-4 hover:underline">Sign out</button>
        </form>
      </aside>
      <main className="min-w-0 flex-1 pb-20">{children}</main>
    </div>
  );
}
