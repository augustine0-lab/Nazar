// Homework that fits the child: the start dice, the own-sound experiment, deals over homework,
// the homework ceiling for an evening and "where I sit best". Pure functions only.
import { nextSchoolDay, tally, type MarkLike } from "./index";
import { firstSchoolDay, schoolDaysBetween } from "./concepts";

/* ---------- start dice ---------- */

export interface StartOption {
  homeworkId: string;
  subject: string;
  title: string;
  /** The first step that is not done yet: the only thing to do for the first two minutes. */
  step: string;
  stepNo: number;
}

/** Minutes the child promises to work after the dice. After them stopping is allowed. */
export const STARTER_MINUTES = 2;
/** One reroll, so the dice does not become a way to put off starting. */
export const DICE_REROLLS = 1;

interface HwLike {
  id: string;
  subject: string;
  title: string;
  steps: { text: string; doneAt: Date | null }[];
}

/** Everything the dice can choose from: each unfinished task with its first open step. */
export function startOptions(hw: HwLike[]): StartOption[] {
  return hw.flatMap((h) => {
    const i = h.steps.findIndex((s) => !s.doneAt);
    return i === -1 ? [] : [{ homeworkId: h.id, subject: h.subject, title: h.title, step: h.steps[i].text, stepNo: i + 1 }];
  });
}

/** A random option; a reroll never lands on the option it replaces when there is another one. */
export function rollStart(options: StartOption[], random = Math.random(), not?: string): StartOption | null {
  const pool = options.length > 1 && not ? options.filter((o) => o.homeworkId !== not) : options;
  if (!pool.length) return null;
  return pool[Math.min(pool.length - 1, Math.floor(random * pool.length))];
}

/* ---------- my sound ---------- */

export const SOUNDS = ["white", "pink", "brown", "rain"] as const;
export type Sound = (typeof SOUNDS)[number];
export const isSound = (v: unknown): v is Sound => (SOUNDS as readonly unknown[]).includes(v);
export const SOUND_ICON: Record<Sound, string> = { white: "⚪", pink: "🌸", brown: "🟤", rain: "🌧️" };

/** The experiment alternates days with and without sound, so a good or bad week does not decide it. */
export const SOUND_TRIAL_DAYS = 6;
/** The loudest the player goes (Web Audio gain). Noise is meant to be quiet, in headphones. */
export const SOUND_MAX_VOLUME = 0.5;
export const SOUND_DEFAULT_VOLUME = 0.2;
/** Fewer answers than this on either side is too little to say anything. */
export const SOUND_MIN_CHECKS = 4;
/** 15 points between the shares of "I am on task" answers counts as a difference. */
export const SOUND_CLEAR_CHANGE = 0.15;

export type SoundDay = "SOUND" | "QUIET" | "DONE" | "NOT_STARTED";

/**
 * What kind of day the date is in an experiment that started on the given school day.
 * Counts the school days before the date, so a weekend day is the same kind of day as the Monday after it.
 */
export function soundDay(startedOn: string, date: string): SoundDay {
  if (date < startedOn) return "NOT_STARTED";
  const days = schoolDaysBetween(firstSchoolDay(startedOn), date);
  const n = days.length - (days.at(-1) === date ? 1 : 0);
  if (n >= SOUND_TRIAL_DAYS) return "DONE";
  return n % 2 === 0 ? "SOUND" : "QUIET";
}

/** The last school day of the experiment. */
export function soundTrialEnd(startedOn: string): string {
  let d = firstSchoolDay(startedOn);
  for (let i = 1; i < SOUND_TRIAL_DAYS; i++) d = nextSchoolDay(d);
  return d;
}

export type SoundVerdict = "NOT_ENOUGH" | "HELPS" | "HURTS" | "SAME";

export interface SoundSide {
  checks: number;
  onTask: number;
  /** Share of "on task" answers, 0..1, or null without answers. */
  ratio: number | null;
}

/** Compares the self-check answers given with sound playing and without it. */
export function soundResult(checks: { onTask: boolean; withNoise: boolean | null }[]) {
  const side = (withNoise: boolean): SoundSide => {
    const c = checks.filter((x) => x.withNoise === withNoise);
    const onTask = c.filter((x) => x.onTask).length;
    return { checks: c.length, onTask, ratio: c.length ? onTask / c.length : null };
  };
  const sound = side(true);
  const quiet = side(false);
  let verdict: SoundVerdict = "NOT_ENOUGH";
  if (sound.checks >= SOUND_MIN_CHECKS && quiet.checks >= SOUND_MIN_CHECKS) {
    const diff = sound.ratio! - quiet.ratio!;
    verdict = diff >= SOUND_CLEAR_CHANGE ? "HELPS" : diff <= -SOUND_CLEAR_CHANGE ? "HURTS" : "SAME";
  }
  return { sound, quiet, verdict };
}

/* ---------- deals over homework ---------- */

/** Ready-made deals, so that answering one takes a single tap. OWN needs a few words from the child. */
export const DEAL_OPTIONS = ["HALF_HARDER", "VOICE", "DRAW", "SPLIT", "LATER", "OWN"] as const;
export type DealOption = (typeof DEAL_OPTIONS)[number];
export const isDealOption = (v: unknown): v is DealOption => (DEAL_OPTIONS as readonly unknown[]).includes(v);
export const DEAL_ICON: Record<DealOption, string> = { HALF_HARDER: "🎯", VOICE: "🎙️", DRAW: "🖍️", SPLIT: "✂️", LATER: "📅", OWN: "💬" };

export const DEAL_STATUS = ["PROPOSED", "COUNTERED", "ACCEPTED", "DECLINED"] as const;
export type DealStatus = (typeof DEAL_STATUS)[number];
/** A child may offer at most two deals for one task: one more try after a "no". */
export const MAX_DEALS_PER_HW = 2;
export const DEAL_NOTE_MAX = 200;

/** Whether a new deal can be offered, given the deals already made for this task. */
export function canOfferDeal(existing: { status: DealStatus }[]): boolean {
  if (existing.some((d) => d.status !== "DECLINED")) return false;
  return existing.length < MAX_DEALS_PER_HW;
}

/** A counter-offer is one of the ready deals, other than the one offered. */
export const validCounter = (offered: DealOption, counter: unknown): counter is DealOption =>
  isDealOption(counter) && counter !== offered && counter !== "OWN";

/* ---------- homework ceiling ---------- */

/**
 * Daily homework limits in minutes by grade, from the Russian sanitary rules SanPiN 1.2.3685-21 (table 6.6):
 * grade 1: 1 h, 2–3: 1.5 h, 4–5: 2 h, 6–8: 2.5 h, 9–11: 3.5 h. Local rules in Kazakhstan must be checked.
 */
export const HOMEWORK_NORM_MIN: Record<number, number> = { 1: 60, 2: 90, 3: 90, 4: 120, 5: 120, 6: 150, 7: 150, 8: 150, 9: 210, 10: 210, 11: 210 };
export const EST_MIN = 5;
export const EST_MAX = 180;
export const ACTUAL_MAX = 300;
/** Quick answers for "how long did it take", in minutes. */
export const ACTUAL_CHIPS = [10, 20, 30, 45, 60, 90] as const;
/** The child's own pace is shown only after this many tasks with both an estimate and a real time. */
export const MIN_PACE_TASKS = 3;
/** How many evenings ahead the load is shown. */
export const LOAD_EVENINGS = 5;

/** The grade of a class from its name, "3 «Б»" → 3. */
export function gradeOf(className: string): number | null {
  const m = /^\s*(\d{1,2})/.exec(className);
  const g = m ? Number(m[1]) : NaN;
  return g >= 1 && g <= 11 ? g : null;
}

export const homeworkNorm = (className: string): number | null => {
  const g = gradeOf(className);
  return g === null ? null : HOMEWORK_NORM_MIN[g];
};

/** How many times longer than the teachers' estimates homework really takes this child, or null when unknown. */
export function paceOf(done: { estMinutes: number | null; actualMinutes: number | null }[]): number | null {
  const both = done.filter((h) => h.estMinutes && h.actualMinutes);
  if (both.length < MIN_PACE_TASKS) return null;
  const est = both.reduce((s, h) => s + h.estMinutes!, 0);
  const act = both.reduce((s, h) => s + h.actualMinutes!, 0);
  return Math.round((act / est) * 10) / 10;
}

export interface Evening {
  /** The day the homework is due; it is done the evening before. */
  dueDate: string;
  /** The evening it is done on. */
  evening: string;
  tasks: number;
  /** Tasks without an estimate. */
  unknown: number;
  estMinutes: number;
  /** The estimate times the child's pace, when the pace is known. */
  likelyMinutes: number | null;
  over: boolean;
}

/** Load of the coming evenings: the sum of all teachers' estimates, against the norm and the child's real pace. */
export function eveningLoad(
  hw: { dueDate: string; estMinutes: number | null }[],
  fromDue: string,
  norm: number | null,
  pace: number | null,
  count = LOAD_EVENINGS,
): Evening[] {
  const out: Evening[] = [];
  let due = firstSchoolDay(fromDue);
  for (let i = 0; i < count; i++) {
    const list = hw.filter((h) => h.dueDate === due);
    const estMinutes = list.reduce((s, h) => s + (h.estMinutes ?? 0), 0);
    const likelyMinutes = pace === null ? null : Math.round(estMinutes * pace);
    const real = likelyMinutes ?? estMinutes;
    out.push({
      dueDate: due,
      evening: eveningBefore(due),
      tasks: list.length,
      unknown: list.filter((h) => !h.estMinutes).length,
      estMinutes,
      likelyMinutes,
      over: norm !== null && real > norm,
    });
    due = nextSchoolDay(due);
  }
  return out;
}

/** The evening before a due date; homework due on Monday is done on Sunday. */
export function eveningBefore(due: string): string {
  const d = new Date(due + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/* ---------- where I sit best ---------- */

export const LAYOUT_ROWS = [3, 4, 5, 6] as const;
export const LAYOUT_COLS = [2, 3, 4] as const;
export const DEFAULT_LAYOUT = { rows: 5, cols: 3, windowSide: "LEFT" as const };
export type WindowSide = "LEFT" | "RIGHT";
/** Two weeks on a seat before comparing, as the idea promises; fewer marked days are not compared. */
export const SEAT_MIN_DAYS = 4;
export const SEAT_SUGGESTED_DAYS = 10;
export const SEAT_CLEAR_CHANGE = 0.1;

export type SeatTrait = "front" | "back" | "window" | "door" | "middle" | "teacher";

/** What a place in the room is like. The board and the teacher's desk are at the front, the door on the side away from the windows. */
export function seatTraits(row: number, col: number, layout: { rows: number; cols: number; windowSide: WindowSide }): SeatTrait[] {
  const out: SeatTrait[] = [];
  const windowCol = layout.windowSide === "LEFT" ? 0 : layout.cols - 1;
  const doorCol = layout.cols - 1 - windowCol;
  if (row === 0) out.push("front");
  if (row === layout.rows - 1) out.push("back");
  if (col === windowCol) out.push("window");
  if (col === doorCol && row === 0) out.push("door");
  if (layout.cols >= 3 && col > 0 && col < layout.cols - 1) out.push("middle");
  // The teacher's desk stands at the front, on the side of the door.
  if (row === 0 && col === doorCol - (layout.cols >= 3 ? 1 : 0)) out.push("teacher");
  return out;
}

export interface SeatPeriod {
  row: number;
  col: number;
  from: string;
  /** Last day on this seat, inclusive; the current seat ends today. */
  to: string;
  days: number;
  ratio: number | null;
}

/** Each stretch of time on one seat with the share of lessons where the goals were met. */
export function seatPeriods(seats: { row: number; col: number; fromDate: string }[], marks: Required<MarkLike>[], today: string): SeatPeriod[] {
  const sorted = [...seats].sort((a, b) => a.fromDate.localeCompare(b.fromDate));
  return sorted.map((s, i) => {
    const next = sorted[i + 1]?.fromDate;
    const to = next ? eveningBefore(next) : today;
    const inside = marks.filter((m) => m.date >= s.fromDate && m.date <= to);
    return { row: s.row, col: s.col, from: s.fromDate, to, days: new Set(inside.map((m) => m.date)).size, ratio: tally(inside).ratio };
  });
}

export type SeatVerdict = "NOT_ENOUGH" | "BETTER" | "WORSE" | "SAME";

/** The current seat against the one before it. A hint for the teacher, never a proof. */
export function seatVerdict(periods: SeatPeriod[]): SeatVerdict {
  if (periods.length < 2) return "NOT_ENOUGH";
  const [before, now] = periods.slice(-2);
  if (before.days < SEAT_MIN_DAYS || now.days < SEAT_MIN_DAYS || before.ratio === null || now.ratio === null) return "NOT_ENOUGH";
  const diff = now.ratio - before.ratio;
  return diff >= SEAT_CLEAR_CHANGE ? "BETTER" : diff <= -SEAT_CLEAR_CHANGE ? "WORSE" : "SAME";
}
