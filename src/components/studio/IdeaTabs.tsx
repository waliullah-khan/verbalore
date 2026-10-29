"use client";

import { useRouter } from "next/navigation";

// The design has one list of ideas. The real app has a playbook for each kind of work, so they sit above it as a segmented control.
export default function IdeaTabs({ items, current }: { items: { id: string; label: string }[]; current: string }) {
  const router = useRouter();
  return (
    <div className="seg" role="group" aria-label="What you make videos about" style={{ marginBottom: "1rem" }}>
      {items.map((p) => (
        <button key={p.id} aria-pressed={p.id === current} onClick={() => router.push(`/ideas?uc=${p.id}`)}>
          {p.label}
        </button>
      ))}
    </div>
  );
}
