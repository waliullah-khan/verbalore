import type { SupabaseClient } from "@supabase/supabase-js";
import { embed } from "../llm";
import { hasFirecrawl, scrapePage } from "../research/firecrawl";

export function chunk(text: string, size = 900): string[] {
  const paras = text.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
  const out: string[] = [];
  let cur = "";
  for (const p of paras) {
    if (cur && cur.length + p.length > size) {
      out.push(cur);
      cur = "";
    }
    cur = cur ? `${cur}\n\n${p}` : p;
    while (cur.length > size * 1.5) {
      out.push(cur.slice(0, size));
      cur = cur.slice(size);
    }
  }
  if (cur) out.push(cur);
  return out;
}

const stripHtml = (html: string) =>
  html
    .replace(/<(script|style|noscript)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

export async function readUrl(url: string): Promise<{ title: string; text: string }> {
  if (!/^https?:\/\//i.test(url)) throw new Error("Enter a full link starting with http");
  if (hasFirecrawl()) {
    const page = await scrapePage(url);
    return { title: page.title || url, text: page.markdown };
  }
  const res = await fetch(url, { headers: { "User-Agent": "verbalore/0.1" }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Could not read that page (${res.status})`);
  const html = await res.text();
  return { title: /<title>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() || url, text: stripHtml(html) };
}

// Stores the document and its chunks. Embeddings are best effort: without a key the chunks
// are still saved, and writing falls back to reading the documents whole.
export async function addDoc(db: SupabaseClient, workspaceId: string, doc: { kind: string; title: string; content: string; source_url?: string }) {
  const { data, error } = await db.from("vl_brain_docs").insert({ ...doc, workspace_id: workspaceId, content: doc.content.slice(0, 60_000) }).select("id").single();
  if (error) throw error;
  const parts = chunk(doc.content.slice(0, 60_000));
  const vectors = await embed(parts);
  await db.from("vl_brain_chunks").insert(
    parts.map((content, i) => ({
      doc_id: data.id,
      workspace_id: workspaceId,
      content,
      embedding: vectors?.[i] ? `[${vectors[i].join(",")}]` : null,
    }))
  );
  return data.id as string;
}
