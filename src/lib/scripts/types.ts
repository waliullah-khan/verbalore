import type { ScriptKind } from "./validate";

export type WriterInput = {
  kind: ScriptKind;
  // the named structure the script follows, such as "Myth-bust", and what that structure does beat by beat
  structure: string;
  structureGuide?: string;
  // a candidate hook the writer may improve on, and the angle of the idea
  hook?: string;
  angle?: string;
  // everything the script is allowed to quote: post text, permit facts, signal summaries
  evidence: string[];
  // the workspace's own notes about what it does, its proof and its offer
  brain?: string;
  // how this person talks
  voice?: string;
  // who it is for and what the workspace sells
  audience?: string;
  offer?: string;
  // a video note goes to one named person
  person?: { name: string; title?: string | null; company?: string };
  // a place signal comes from a city's own records
  place?: string;
  // facts about the situation that are not evidence but may be mentioned (the speaker's company name, the day)
  context?: string;
  cta?: string;
  // extra rules a path needs on top of the common ones
  rules?: string[];
};
