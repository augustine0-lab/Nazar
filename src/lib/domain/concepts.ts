// Rules for trying one technique at a time, the transition passport and class-wide supports
// (universal design for learning). Pure functions only.
import { addDays, isSchoolDay, nextSchoolDay, previousSchoolDay } from "./index";

/* ---------- trying a technique: before and during ---------- */

/** How long a trial can run, in school days. */
export const TRIAL_LENGTHS = [5, 10, 15] as const;
export const DEFAULT_TRIAL_DAYS = 10;
/** A trial is extended by this many school days when the result is not clear yet. */
export const TRIAL_EXTEND_DAYS = 5;
/** School days before the start that serve as the "before" phase. */
export const BASELINE_DAYS = 10;
/** Fewer marked days than this in a phase is too little to compare. */
export const MIN_PHASE_DAYS = 4;
/** A difference of 10 points in the share of lessons with the goal met counts as a clear change. */
export const CLEAR_CHANGE = 0.1;
/** At least 70% of the days during the trial should be above the median day before it. */
export const MIN_PEM = 0.7;

/** The first school day on or after the date. */
export const firstSchoolDay = (date: string) => (isSchoolDay(date) ? date : nextSchoolDay(date));

/** The n-th school day counting the start as the first one. */
export function nthSchoolDay(start: string, n: number): string {
  let d = firstSchoolDay(start);
  for (let i = 1; i < n; i++) d = nextSchoolDay(d);
  return d;
}

/** The n school days right before the date, oldest first. */
export function schoolDaysBefore(date: string, n: number): string[] {
  const out: string[] = [];
  let d = date;
  for (let i = 0; i < n; i++) {
    d = previousSchoolDay(d);
    out.unshift(d);
  }
  return out;
}

/** School days from start to end inclusive. */
export function schoolDaysBetween(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) if (isSchoolDay(d)) out.push(d);
  return out;
}

export type TrialVerdict = "NOT_ENOUGH" | "BETTER" | "MIXED" | "WORSE" | "NO_CHANGE";

export interface PhaseStats {
  days: number;
  mean: number | null;
  median: number | null;
}

function phase(ratios: (number | null)[]): PhaseStats {
  const xs = ratios.filter((r): r is number => r !== null).sort((a, b) => a - b);
  const mid = xs.length >> 1;
  const median = xs.length ? (xs.length % 2 ? xs[mid] : (xs[mid - 1] + xs[mid]) / 2) : null;
  return { days: xs.length, mean: xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null, median };
}

/**
 * Compares the daily share of lessons with the goal met before and during a trial (an AB design).
 * PEM is the share of days during the trial above the median day before it, a common measure for
 * single-case studies that one lucky day does not distort. A higher average with uneven days is MIXED.
 * The verdict is a hint for the team, not proof: progress may have started earlier.
 */
export function trialResult(before: (number | null)[], during: (number | null)[]) {
  const a = phase(before);
  const b = phase(during);
  const diff = a.mean !== null && b.mean !== null ? b.mean - a.mean : null;
  const duringDays = during.filter((r): r is number => r !== null);
  const pem = a.median !== null && duringDays.length ? duringDays.filter((r) => r > a.median!).length / duringDays.length : null;
  let verdict: TrialVerdict;
  if (a.days < MIN_PHASE_DAYS || b.days < MIN_PHASE_DAYS || diff === null) verdict = "NOT_ENOUGH";
  else if (diff >= CLEAR_CHANGE) verdict = (pem ?? 0) >= MIN_PEM ? "BETTER" : "MIXED";
  else if (diff <= -CLEAR_CHANGE) verdict = "WORSE";
  else verdict = "NO_CHANGE";
  return { before: a, during: b, diff, pem, verdict };
}

/* ---------- transition passport ---------- */

export const PASSPORT_FIELDS = ["strengths", "interests", "helps", "hard", "calming", "family"] as const;
export type PassportField = (typeof PASSPORT_FIELDS)[number];
export const PASSPORT_MAX = 600;

/* ---------- class-wide supports (universal design for learning, CAST) ---------- */

export const UDL_PRINCIPLES = ["ENGAGE", "REPRESENT", "EXPRESS"] as const;
export type UdlPrinciple = (typeof UDL_PRINCIPLES)[number];

/** Supports a teacher can give the whole class; texts are message keys udl.<key>.title / .body. */
export const UDL_SUPPORTS = [
  { key: "goal", principle: "ENGAGE", icon: "🎯" },
  { key: "choice", principle: "ENGAGE", icon: "🔀" },
  { key: "move", principle: "ENGAGE", icon: "🤸" },
  { key: "praise", principle: "ENGAGE", icon: "👏" },
  { key: "board", principle: "REPRESENT", icon: "🗂️" },
  { key: "twoWays", principle: "REPRESENT", icon: "🗣️" },
  { key: "example", principle: "REPRESENT", icon: "🖼️" },
  { key: "timer", principle: "REPRESENT", icon: "⏳" },
  { key: "chunks", principle: "EXPRESS", icon: "🧩" },
  { key: "answerWays", principle: "EXPRESS", icon: "🎤" },
  { key: "checklist", principle: "EXPRESS", icon: "✅" },
  { key: "space", principle: "EXPRESS", icon: "🪑" },
] as const satisfies readonly { key: string; principle: UdlPrinciple; icon: string }[];
export type UdlSupport = (typeof UDL_SUPPORTS)[number]["key"];
export const isUdlSupport = (k: string): k is UdlSupport => UDL_SUPPORTS.some((s) => s.key === k);

/** How many supports of each principle are on, so the teacher sees which side of the lesson is thin. */
export function udlCoverage(enabled: Iterable<string>) {
  const on = new Set(enabled);
  return UDL_PRINCIPLES.map((p) => {
    const all = UDL_SUPPORTS.filter((s) => s.principle === p);
    return { principle: p, on: all.filter((s) => on.has(s.key)).length, total: all.length };
  });
}

/* ---------- lesson board shown to the whole class ---------- */

export interface BoardStep {
  icon: string;
  text: string;
  minutes: number;
}
export const MAX_BOARD_STEPS = 10;
export const MAX_STEP_MINUTES = 45;
export const DEFAULT_STEP_MINUTES = 5;
export const DEFAULT_BOARD_ICON = "📌";

/**
 * One step per line: "picture | what we do | minutes". The picture and the minutes may be left out:
 * "Читаем текст | 10" or just "Читаем текст". Empty lines are skipped.
 */
export function parseBoardSteps(text: string): BoardStep[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split("|").map((p) => p.trim());
      let minutes = DEFAULT_STEP_MINUTES;
      if (parts.length > 1 && /^\d{1,3}$/.test(parts[parts.length - 1])) minutes = Number(parts.pop());
      let icon = DEFAULT_BOARD_ICON;
      if (parts.length > 1 && parts[0].length <= 12) icon = parts.shift()!;
      return { icon, text: parts.join(" | "), minutes };
    });
}

export const boardStepsToText = (steps: BoardStep[]) => steps.map((s) => `${s.icon} | ${s.text} | ${s.minutes}`).join("\n");
