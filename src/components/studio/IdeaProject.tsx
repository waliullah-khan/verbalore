"use client";

import { useEffect } from "react";

// The design's "current project": Record, Edit and Post all work on the idea you opened last.
export function setProject(id: string) {
  try {
    document.cookie = `vl-project=${encodeURIComponent(id)}; path=/; max-age=2592000; samesite=lax`;
  } catch {}
}

export default function ProjectCookie({ id }: { id: string }) {
  useEffect(() => setProject(id), [id]);
  return null;
}
