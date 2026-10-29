"use client";

import { useEffect, useRef } from "react";

// A horizontally scrolling row that opens with the selected item in view, so the active tab
// is never hidden off-screen on a phone.
export default function ScrollActive({ children, className, label }: { children: React.ReactNode; className?: string; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    if (!el || !ref.current) return;
    const row = ref.current;
    row.scrollLeft = el.offsetLeft - (row.clientWidth - el.clientWidth) / 2;
  }, []);
  return (
    <div ref={ref} className={className} role="tablist" aria-label={label}>
      {children}
    </div>
  );
}
