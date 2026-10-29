import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { currentWorkspace } from "@/lib/workspace";
import { loadStudioState } from "@/lib/studio-state";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

// The shell asks for this after each page change, because a layout is not re-rendered when only the page changes.
export async function GET() {
  const { ws } = await currentWorkspace();
  const state = await loadStudioState(ws.id, cookies().get("vl-project")?.value ?? null);
  return NextResponse.json(state);
}
