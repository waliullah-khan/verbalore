// Read-only check that each configured key is accepted. Prints status codes, never values.
export {};
const env = process.env;

async function probe(name: string, run: () => Promise<Response>, ok = (r: Response) => r.ok) {
  if (!name) return;
  const t0 = Date.now();
  try {
    const res = await run();
    const body = (await res.text()).slice(0, 140).replace(/\s+/g, " ");
    console.log(`${ok(res) ? "OK  " : "FAIL"} ${name.padEnd(12)} ${res.status} ${Date.now() - t0}ms${ok(res) ? "" : "  " + body}`);
  } catch (e) {
    console.log(`FAIL ${name.padEnd(12)} ${(e as Error).message}`);
  }
}

async function main() {
  await probe("typesafe", () => fetch(`${env.TYPESAFE_API_BASE ?? "https://api.typesafe.ai"}/v1/systemone`, {
    method: "POST",
    headers: { Authorization: `Bearer ${env.TYPESAFE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model: env.JEV_MODEL ?? "jev-latest", state: "Clay raises $115M Series D", questions: { kind: { type: "choice", instructions: "What happened", criteria: { funding: "raised money", hiring: "is hiring" } } } }),
  }));
  await probe("openrouter", () => fetch("https://openrouter.ai/api/v1/auth/key", { headers: { Authorization: `Bearer ${env.OPENROUTER_API_KEY}` } }));
  await probe("firecrawl", () => fetch("https://api.firecrawl.dev/v2/team/credit-usage", { headers: { Authorization: `Bearer ${env.FIRECRAWL_API_KEY}` } }));
  await probe("cartesia", () => fetch("https://api.cartesia.ai/voices?limit=1", { headers: { "X-API-Key": env.CARTESIA_API_KEY!, "Cartesia-Version": "2025-04-16" } }));
  await probe("resend", () => fetch("https://api.resend.com/domains", { headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` } }), (r) => r.ok || r.status === 401 && false);
  await probe("upload-post", () => fetch("https://api.upload-post.com/api/uploadposts/users", { headers: { Authorization: `Apikey ${env.UPLOAD_POST_API_KEY}` } }));
  await probe("supabase-svc", () => fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/vl_workspaces?select=id&limit=1`, { headers: { apikey: env.SUPABASE_SERVICE_KEY!, Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}` } }));
  await probe("apify", () => fetch(`https://api.apify.com/v2/users/me?token=${env.APIFY_TOKEN}`));
}
main();
