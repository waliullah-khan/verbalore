// Fails if a tracked or about-to-be-tracked file looks like it holds a secret.
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

const patterns = [
  /apify_api_[A-Za-z0-9]{20,}/,
  /sk-or-v1-[A-Za-z0-9]{20,}/,
  /fc-[A-Za-z0-9]{24,}/,
  /re_[A-Za-z0-9]{20,}/,
  /eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}/,
  /sb_secret_[A-Za-z0-9_-]{10,}/,
  /(?:API_KEY|TOKEN|SECRET|PASSWORD)[ \t]*=[ \t]*["']?[A-Za-z0-9_\-]{16,}/,
];

const files = execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

let bad = 0;
for (const f of files) {
  if (/(^|\/)\.env($|\.)/.test(f) && !f.endsWith(".env.example")) {
    console.error(`env file would be committed: ${f}`);
    bad++;
    continue;
  }
  if (/\.(png|jpg|jpeg|ico|woff2?|mp4|webm|lock)$|package-lock\.json$/.test(f)) continue;
  let text;
  try {
    text = readFileSync(f, "utf8");
  } catch {
    continue;
  }
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      console.error(`${f}: matches ${re}`);
      bad++;
      break;
    }
  }
}
if (bad) process.exit(1);
console.log(`secret scan clean (${files.length} files)`);
