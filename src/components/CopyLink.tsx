"use client";

import { useState } from "react";

export default function CopyLink({ value }: { value: string }) {
  const [done, setDone] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setDone(true);
      setTimeout(() => setDone(false), 1800);
    } catch {}
  }
  return (
    <div className="flex gap-2">
      <input readOnly value={value} aria-label="Personal sign-in link" className="lf mono text-[0.8rem]" onFocus={(e) => e.currentTarget.select()} />
      <button type="button" className="btn btn-ghost shrink-0" onClick={copy}>{done ? "Copied" : "Copy"}</button>
    </div>
  );
}
