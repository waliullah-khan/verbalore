import { supabaseBrowser } from "@/lib/supabase/browser";

// A signed upload straight to storage, with a real percentage for the progress ring. It sends the same
// request the storage library does; if the network call fails outright, the library is tried once.
export async function uploadSigned(path: string, token: string, blob: Blob, onProgress: (pct: number) => void): Promise<{ error?: string }> {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  const res = await new Promise<{ ok: boolean; status: number; text: string }>((resolve) => {
    const x = new XMLHttpRequest();
    x.open("PUT", `${base}/storage/v1/object/upload/sign/vl-recordings/${path}?token=${encodeURIComponent(token)}`);
    x.setRequestHeader("apikey", key);
    x.setRequestHeader("Authorization", `Bearer ${key}`);
    x.setRequestHeader("x-upsert", "false");
    x.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.min(99, Math.round((e.loaded / e.total) * 100)));
    x.onload = () => resolve({ ok: x.status >= 200 && x.status < 300, status: x.status, text: x.responseText });
    x.onerror = () => resolve({ ok: false, status: 0, text: "" });
    const form = new FormData();
    form.append("cacheControl", "3600");
    form.append("", blob);
    x.send(form);
  });

  if (res.ok) {
    onProgress(100);
    return {};
  }
  if (res.status === 0) {
    const up = await supabaseBrowser().storage.from("vl-recordings").uploadToSignedUrl(path, token, blob, { contentType: blob.type || "video/webm" });
    if (!up.error) {
      onProgress(100);
      return {};
    }
    return { error: up.error.message };
  }
  let message = res.text;
  try {
    message = (JSON.parse(res.text) as { message?: string }).message ?? res.text;
  } catch {
    // keep the raw text
  }
  return { error: message || `Upload failed (${res.status})` };
}
