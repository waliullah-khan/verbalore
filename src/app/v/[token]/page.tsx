import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import type { Script } from "@/lib/ideas/types";

type Note = { id: string; script: Script; video_path: string | null; workspace: string; contact: string | null };

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // Next would otherwise cache the Supabase reads

export default async function Share({ params }: { params: { token: string } }) {
  const db = supabaseServer();
  const { data } = await db.rpc("vl_get_note", { p_token: params.token });
  const note = data as Note | null;
  if (!note) notFound();

  await db.rpc("vl_log_note_view", { p_token: params.token, p_ua: headers().get("user-agent") ?? "" });
  const url = note.video_path ? db.storage.from("vl-videos").getPublicUrl(note.video_path).data.publicUrl : null;

  return (
    <main className="mx-auto max-w-md px-5 py-10">
      <p className="eyebrow">A note from {note.workspace}</p>
      <h1 className="mt-2 text-3xl leading-tight">{note.contact ? `For ${note.contact.split(" ")[0]}` : "A short note"}</h1>
      {url && (
        <div className="mt-6 aspect-[9/16] w-full overflow-hidden rounded-3xl bg-black">
          <video src={url} controls playsInline autoPlay className="h-full w-full object-cover" />
        </div>
      )}
      <p className="muted mt-6 text-sm">{note.script.beats[0]?.text}</p>
      <p className="muted mt-8 text-xs">Made with Verbalore</p>
    </main>
  );
}
