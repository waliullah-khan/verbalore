// What the Library, Edit and Post screens pass between the server and the browser.
export type LibStatus = "posted" | "scheduled" | "draft" | "note";

export type LibResult = { name: string; ok: boolean | null; url?: string };

export type LibItem = {
  id: string;
  videoId: string | null;
  kind: "video" | "note";
  t: string;
  st: LibStatus;
  pill: string;
  when: string; // ISO time the date label is made from
  whenKind: "posted" | "scheduled" | "made" | "sent";
  pl: string[];
  results: LibResult[];
  opens: number;
  len: number;
  th: string;
  videoUrl: string | null;
  ideaId: string | null;
  canRerender: boolean;
  shareUrl: string | null;
};

export type InboxItem = {
  id: string;
  kind: "recording" | "editing" | "failed";
  t: string;
  sec: number;
  when: string;
  note?: string;
  videoId?: string;
  fromPhone?: boolean;
};

export type EditScene = {
  type: string;
  start: number;
  end: number;
  text: string;
  headline: string;
  sub?: string;
  stat?: string;
  items?: string[];
};

export type Contact = { id: string; name: string; title: string; account: string; email: string };

export type PlatformCard = { id: string; name: string; limit: number; title: boolean; connected: boolean; account: string };

export type PublishState = {
  status: string;
  scheduledAt: string | null;
  platforms: string[];
  results: Record<string, { success?: boolean; url?: string; simulated?: boolean; error?: string }>;
  // set when the worker refused or dropped the job, so the screen can say so instead of waiting
  jobError?: string;
};
