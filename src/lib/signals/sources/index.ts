import { githubSignals } from "./github";
import { jobSignals, type Board } from "./jobs";
import { secSignals } from "./sec";
import { siteSignals } from "./site";
import type { Account, Found } from "./types";

export type PrimaryResult = { found: Found[]; board: Board | null; notes: string[] };

// The sources that read the record directly. Each one fails on its own without taking the others down.
export async function primarySignals(account: Account): Promise<PrimaryResult> {
  const notes: string[] = [];
  const [sec, jobs, site, github] = await Promise.allSettled([secSignals(account), jobSignals(account), siteSignals(account), githubSignals(account)]);

  const found: Found[] = [];
  let board: Board | null = null;
  const take = <T,>(name: string, r: PromiseSettledResult<T>, use: (v: T) => void) => {
    if (r.status === "fulfilled") use(r.value);
    else notes.push(`${name}: ${(r.reason as Error).message}`);
  };
  take("sec", sec, (v) => found.push(...v));
  take("jobs", jobs, (v) => { found.push(...v.found); board = v.board; });
  take("site", site, (v) => { found.push(...v.found); if (v.baselined) notes.push(`site: baseline set for ${v.baselined} pages`); });
  take("github", github, (v) => found.push(...v));
  return { found, board, notes };
}
