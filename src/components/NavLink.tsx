"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function NavLink({ href, children, variant }: { href: string; children: React.ReactNode; variant: "rail" | "tab" }) {
  const path = usePathname();
  const here = path === href || path.startsWith(`${href}/`);
  const base =
    variant === "rail"
      ? "flex min-h-[3rem] items-center justify-between gap-2 rounded-xl px-3.5 text-[1rem] font-bold"
      : "flex min-h-[3.2rem] flex-1 items-center justify-center rounded-xl px-1 text-[0.8rem] font-bold";
  return (
    <Link
      href={href}
      aria-current={here ? "page" : undefined}
      className={`${base} ${here ? "bg-[var(--ink)] text-[var(--paper)]" : "hover:bg-[var(--paper-2)]"}`}
    >
      {children}
    </Link>
  );
}
