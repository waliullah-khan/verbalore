import { austinSignals } from "./austin";
import { githubSignals } from "./github";
import { jobSignals, type Board } from "./jobs";
import { secSignals } from "./sec";
import { siteSignals } from "./site";
import type { Account, Found } from "./types";

export type PrimaryResult = { found: Found[]; board: Board | null; notes: string[] };

// A watched place (a city) is read from that city's own records. Only Austin is wired so far.
export const isPlace = (a: Account) => !!(a.meta as { place?: { city?: string } } | null)?.place;

// The sources that read the record directly. Each one fails on its own without taking the others down.
export async function primarySignals(account: Account): Promise<PrimaryResult> {
  const notes: string[] = [];

  if (isPlace(account)) {
    const city = (account.meta as { place: { city: string } }).place.city;
    if (city !== "austin") return { found: [], board: null, notes: [`${city}: no data source yet`] };
    try {
      return { found: await austinSignals(), board: null, notes };
    } catch (e) {
      return { found: [], board: null, notes: [`permits: ${(e as Error).message}`] };
    }
  }

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
