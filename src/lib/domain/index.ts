// Pure business rules from the specification. No database or framework imports here,
// so every rule can be unit-tested directly.

import { LOCALE, WEEKDAYS, formatDate as formatDateIn, type Lang, type Msg } from "../i18n";

export type MarkValue = "YES" | "NO" | "NA";

export const MAX_GOALS = 4;
export const MIN_THRESHOLD = 50;
export const MAX_THRESHOLD = 90;
export const SELF_CHECK_STAR_CAP = 3;
export const DAY_AUTO_CLOSE_HOUR = 18;
export const RAISE_BAR = 0.9;
export const SIMPLIFY_BAR = 0.3;

/* ---------- dates (all dates are local school dates, YYYY-MM-DD) ---------- */

export const APP_TZ = process.env.APP_TZ ?? "Asia/Almaty";

export function isoDate(d: Date, tz = APP_TZ): string {
  // en-CA formats as YYYY-MM-DD
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export function localTime(d: Date, tz = APP_TZ): { hour: number; minute: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { hour: get("hour"), minute: get("minute") };
}

export function addDays(date: string, n: number): string {
  const d = new Date(date + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday … 7 = Sunday */
export function weekday(date: string): number {
  const w = new Date(date + "T12:00:00Z").getUTCDay();
  return w === 0 ? 7 : w;
}

export const isSchoolDay = (date: string) => weekday(date) <= 5;

export function mondayOf(date: string): string {
  return addDays(date, 1 - weekday(date));
}

export function schoolDaysOfWeek(monday: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(monday, i));
}

export function previousSchoolDay(date: string): string {
  let d = addDays(date, -1);
  while (!isSchoolDay(d)) d = addDays(d, -1);
  return d;
}

export function nextSchoolDay(date: string): string {
  let d = addDays(date, 1);
  while (!isSchoolDay(d)) d = addDays(d, 1);
  return d;
}

export const shortWeekday = (date: string, lang: Lang = "ru") => WEEKDAYS[lang][weekday(date) - 1];

export const formatDate = formatDateIn;

/** A point in time as a school-local date, for example "17 октября 2026". */
export const formatStamp = (d: Date, lang: Lang, withYear = false) =>
  d.toLocaleDateString(LOCALE[lang], { day: "numeric", month: "long", ...(withYear ? { year: "numeric" } : {}), timeZone: APP_TZ });

/* ---------- lessons ---------- */

/** Lesson that is running now or has just ended; 1-based. Before school returns 1, after school the last lesson. */
export function currentLessonNo(bellSchedule: string[], now: { hour: number; minute: number }): number {
  const minutes = now.hour * 60 + now.minute;
  let current = 1;
  bellSchedule.forEach((start, i) => {
    const [h, m] = start.split(":").map(Number);
    if (minutes >= h * 60 + m) current = i + 1;
  });
  return current;
}

/** Teachers may correct marks for today and the previous school day. */
export function canEditMarksFor(date: string, today: string): boolean {
  return date === today || date === previousSchoolDay(today);
}

export function isDayClosed(date: string, closedAt: Date | null | undefined, today: string, now: { hour: number }): boolean {
  if (closedAt) return true;
  if (date < today) return true;
  return date === today && now.hour >= DAY_AUTO_CLOSE_HOUR;
}

/* ---------- day and week statistics ---------- */

export interface MarkLike {
  goalId: string;
  value: MarkValue;
  date?: string;
}

export interface Tally {
  yes: number;
  no: number;
  na: number;
  /** Share of YES among rated marks, 0..1, or null when nothing was rated. */
  ratio: number | null;
}

export function tally(marks: MarkLike[]): Tally {
  let yes = 0,
    no = 0,
    na = 0;
  for (const m of marks) {
    if (m.value === "YES") yes++;
    else if (m.value === "NO") no++;
    else na++;
  }
  const rated = yes + no;
  return { yes, no, na, ratio: rated ? yes / rated : null };
}

export const pct = (ratio: number | null) => (ratio === null ? null : Math.round(ratio * 100));

export function isSuccessfulDay(t: Tally, thresholdPct: number): boolean {
  return t.ratio !== null && t.ratio * 100 >= thresholdPct;
}

export function tallyByGoal(marks: MarkLike[], goalIds: string[]): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const g of goalIds) out[g] = tally(marks.filter((m) => m.goalId === g));
  return out;
}

export function tallyByDate(marks: Required<MarkLike>[], dates: string[]): Record<string, Tally> {
  const out: Record<string, Tally> = {};
  for (const d of dates) out[d] = tally(marks.filter((m) => m.date === d));
  return out;
}

/* ---------- stars ---------- */

export interface BalanceInput {
  yesMarks: number;
  selfCheckStars: number;
  grantedCosts: number[];
}

/** Balance is always derived from source records and never negative. */
export function starBalance({ yesMarks, selfCheckStars, grantedCosts }: BalanceInput): number {
  const spent = grantedCosts.reduce((a, b) => a + b, 0);
  return Math.max(0, yesMarks + selfCheckStars - spent);
}

export function selfCheckEarnsStar(onTask: boolean, starsAlreadyToday: number): boolean {
  return onTask && starsAlreadyToday < SELF_CHECK_STAR_CAP;
}

export function canRequestReward(balance: number, cost: number): boolean {
  return balance >= cost;
}

/* ---------- plan rules ---------- */

export interface PlanLike {
  id: string;
  status: "DRAFT" | "PENDING" | "ACTIVE" | "ARCHIVED";
  effectiveFrom: string | null;
  version: number;
}

/** The approved plan that governed a given date (latest effectiveFrom not after the date). */
export function planForDate<T extends PlanLike>(plans: T[], date: string): T | null {
  const approved = plans
    .filter((p) => (p.status === "ACTIVE" || p.status === "ARCHIVED") && p.effectiveFrom && p.effectiveFrom <= date)
    .sort((a, b) => (a.effectiveFrom! < b.effectiveFrom! ? 1 : a.effectiveFrom! > b.effectiveFrom! ? -1 : b.version - a.version));
  return approved[0] ?? null;
}

export interface PlanDraftInput {
  goals: { adultText: string; childText: string; place: "SCHOOL" | "HOME" }[];
  thresholdPct: number;
  workMinutes: number;
  breakMinutes: number;
}

export function validatePlan(p: PlanDraftInput): Msg[] {
  const errors: Msg[] = [];
  if (p.goals.length < 1) errors.push({ key: "plan.err.noGoal" });
  if (p.goals.length > MAX_GOALS) errors.push({ key: "plan.err.maxGoals", params: { max: MAX_GOALS } });
  p.goals.forEach((g, i) => {
    if (!g.adultText.trim()) errors.push({ key: "plan.err.adultText", params: { n: i + 1 } });
    if (!g.childText.trim()) errors.push({ key: "plan.err.childText", params: { n: i + 1 } });
  });
  if (p.thresholdPct < MIN_THRESHOLD || p.thresholdPct > MAX_THRESHOLD || p.thresholdPct % 5 !== 0)
    errors.push({ key: "plan.err.threshold", params: { min: MIN_THRESHOLD, max: MAX_THRESHOLD } });
  if (p.workMinutes < 3 || p.workMinutes > 30) errors.push({ key: "plan.err.work" });
  if (p.breakMinutes < 1 || p.breakMinutes > 15) errors.push({ key: "plan.err.break" });
  return errors;
}

export type Suggestion = "RAISE" | "SIMPLIFY";

/**
 * Hint for the psychologist based on the last two full weeks of one goal.
 * weeklyRatios: oldest first; null when the goal had no rated marks that week.
 */
export function goalSuggestion(weeklyRatios: (number | null)[]): Suggestion | null {
  const lastTwo = weeklyRatios.slice(-2);
  if (lastTwo.length < 2 || lastTwo.some((r) => r === null)) return null;
  if (lastTwo.every((r) => r! > RAISE_BAR)) return "RAISE";
  if (lastTwo.every((r) => r! < SIMPLIFY_BAR)) return "SIMPLIFY";
  return null;
}

/* ---------- focus timer ---------- */

export interface TimerState {
  phase: "WORK" | "BREAK";
  remainingSec: number;
  cycle: number;
}

/** Derives the timer from its start time, so a background tab never drifts. */
export function timerState(elapsedSec: number, workMin: number, breakMin: number): TimerState {
  const work = workMin * 60,
    brk = breakMin * 60,
    full = work + brk;
  const e = Math.max(0, Math.floor(elapsedSec));
  const cycle = Math.floor(e / full);
  const inCycle = e % full;
  return inCycle < work
    ? { phase: "WORK", remainingSec: work - inCycle, cycle }
    : { phase: "BREAK", remainingSec: full - inCycle, cycle };
}

/** Seconds into a work block when the self-check prompt appears: random between minute 4 and 7, clamped to the block. */
export function selfCheckAt(workMin: number, random = Math.random()): number {
  const work = workMin * 60;
  const lo = Math.min(240, Math.floor(work * 0.4)),
    hi = Math.min(420, Math.floor(work * 0.8));
  return Math.round(lo + (hi - lo) * random);
}
export * from "./extras";
export * from "./more";
export * from "./concepts";
export * from "./reading";
