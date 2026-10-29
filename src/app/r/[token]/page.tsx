import { serviceClient } from "@/lib/supabase/service";
import { isExpired } from "@/lib/capture";
import PhoneRecorder from "./PhoneRecorder";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store"; // Next would otherwise cache the Supabase reads
export const metadata = { title: "Record · Verbalore" };

function Message({ title, body }: { title: string; body: string }) {
  return (
    <main className="mx-auto flex min-h-[100dvh] max-w-sm flex-col justify-center px-6 text-center">
      <h1 className="text-2xl">{title}</h1>
      <p className="muted mt-2 text-sm">{body}</p>
    </main>
  );
}

// Opened by scanning the QR code in the desktop Studio. No sign-in: the link itself is the key.
export default async function Phone({ params }: { params: { token: string } }) {
  const db = await serviceClient();
  const { data: s } = await db
    .from("vl_capture_sessions")
    .select("expires_at,idea:vl_ideas(angle,script)")
    .eq("token", params.token)
    .maybeSingle();

  if (!s) return <Message title="This link is not valid" body="Open the Studio on your computer and scan a fresh QR code." />;
  if (isExpired(s)) return <Message title="This link has expired" body="Open the Studio on your computer and scan a fresh QR code." />;

  const idea = s.idea as unknown as { angle: string; script: { beats: { label: string; text: string }[] } } | null;
  if (!idea) return <Message title="Nothing to record" body="The idea for this link was removed." />;

  return <PhoneRecorder token={params.token} title={idea.angle} beats={idea.script.beats} />;
}
