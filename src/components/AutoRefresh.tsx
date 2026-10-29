"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Re-renders the server component on an interval while a background job is running.
export default function AutoRefresh({ active, every = 3000 }: { active: boolean; every?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => router.refresh(), every);
    return () => clearInterval(t);
  }, [active, every, router]);
  return null;
}
