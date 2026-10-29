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

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal|.*\.localhost)$/i;
const PRIVATE_IPV4 = /^(0\.|10\.|127\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/;

// Visitors type these links, so the server must never be pointed at a private network, loopback or a raw IP address.
export function isPublicHttpUrl(raw: string): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return false;
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(host) || PRIVATE_IPV4.test(host) || host.includes(":")) return false;
  if (/^\d+(\.\d+){3}$/.test(host)) return false;
  return host.includes(".");
}

export async function readUrl(url: string): Promise<{ title: string; text: string }> {
  if (!isPublicHttpUrl(url)) throw new Error("Enter the full address of a public web page");
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
export async function addDoc(db: SupabaseClient, workspaceId: string, doc: { kind: string; title: string; content: string; source_url?: string; use_case?: string | null }) {
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
