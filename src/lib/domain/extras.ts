// Rules for the schedule, mood, pet, movement breaks, observation scales and the weekly class review.
// Pure functions only, like the rest of the domain.

import type { Tally } from "./index";

/* ---------- pet ---------- */

/** Lifetime stars needed to reach each growth stage; the pet never shrinks when stars are spent on rewards. */
export const PET_STAGES = [0, 8, 25, 50, 90] as const;

export function petStage(lifetimeStars: number): { stage: number; last: boolean; toNext: number } {
  let stage = 0;
  PET_STAGES.forEach((from, i) => {
    if (lifetimeStars >= from) stage = i;
  });
  const last = stage === PET_STAGES.length - 1;
  return { stage, last, toNext: last ? 0 : PET_STAGES[stage + 1] - lifetimeStars };
}

/* ---------- mood ---------- */

export const MOOD_MIN = 1;
export const MOOD_MAX = 5;
export const isMood = (n: unknown): n is number => Number.isInteger(n) && (n as number) >= MOOD_MIN && (n as number) <= MOOD_MAX;

export function moodAverage(moods: number[]): number | null {
  return moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null;
}

/* ---------- visual schedule ---------- */

export const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

export function byTime<T extends { time: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.time < b.time ? -1 : a.time > b.time ? 1 : 0));
}

/** The first undone item is "now"; everything before it is finished. */
export function scheduleProgress(items: { id: string }[], doneIds: Set<string>): { done: number; total: number; currentId: string | null } {
  const next = items.find((i) => !doneIds.has(i.id));
  return { done: items.filter((i) => doneIds.has(i.id)).length, total: items.length, currentId: next?.id ?? null };
}

/* ---------- movement breaks ---------- */

export const BREAK_EXERCISES = ["stretch", "jumps", "wall", "breathe", "shake", "march"] as const;
export type BreakExercise = (typeof BREAK_EXERCISES)[number];

/** A different exercise for every break of a homework session. */
export const exerciseForCycle = (cycle: number): BreakExercise => BREAK_EXERCISES[((cycle % BREAK_EXERCISES.length) + BREAK_EXERCISES.length) % BREAK_EXERCISES.length];

/* ---------- note templates ---------- */

export const NOTE_TEMPLATES = ["calm", "help", "praise", "tired", "talk"] as const;

/* ---------- observation scale ---------- */

// Eighteen statements in the spirit of the public Vanderbilt-type teacher and parent scales:
// the first nine describe inattention, the last nine hyperactivity and impulsivity.
export const SCALE_INATTENTION = 9;
export const SCALE_ITEM_COUNT = 18;
export const SCALE_ITEMS = Array.from({ length: SCALE_ITEM_COUNT }, (_, i) => `sc.i${i + 1}`);
export const SCALE_CHOICES = [0, 1, 2, 3] as const;
/** An item counts as a concern when it is rated "often" or "very often". */
export const SCALE_CONCERN_FROM = 2;
export const SCALE_FLAG_COUNT = 6;

export function validScaleAnswers(a: unknown): a is number[] {
  return Array.isArray(a) && a.length === SCALE_ITEM_COUNT && a.every((v) => Number.isInteger(v) && v >= 0 && v <= 3);
}

export interface ScaleScore {
  inattention: { sum: number; concerns: number; flagged: boolean };
  hyperactivity: { sum: number; concerns: number; flagged: boolean };
}

export function scoreScale(answers: number[]): ScaleScore {
  const part = (xs: number[]) => {
    const concerns = xs.filter((v) => v >= SCALE_CONCERN_FROM).length;
    return { sum: xs.reduce((a, b) => a + b, 0), concerns, flagged: concerns >= SCALE_FLAG_COUNT };
  };
  return { inattention: part(answers.slice(0, SCALE_INATTENTION)), hyperactivity: part(answers.slice(SCALE_INATTENTION)) };
}

/* ---------- weekly class review ---------- */

export const STRUGGLE_DAYS = 3;

/**
 * Goals that did not reach the plan threshold on at least STRUGGLE_DAYS of the given days.
 * Days without rated marks do not count either way.
 */
export function strugglingGoals(days: Record<string, Tally>[], goalIds: string[], thresholdPct: number): { goalId: string; badDays: number; ratedDays: number }[] {
  const out: { goalId: string; badDays: number; ratedDays: number }[] = [];
  for (const goalId of goalIds) {
    const rated = days.map((d) => d[goalId]).filter((t) => t && t.ratio !== null);
    const badDays = rated.filter((t) => t.ratio! * 100 < thresholdPct).length;
    if (badDays >= STRUGGLE_DAYS) out.push({ goalId, badDays, ratedDays: rated.length });
  }
  return out;
}

const EVIDENCE_ORDER = { STRONG: 0, MODERATE: 1, PRACTICE: 2 } as const;

/** Techniques that are not in the plan yet, best evidence first. */
export function suggestTechniques<T extends { id: string; evidence: keyof typeof EVIDENCE_ORDER; title: string }>(all: T[], inPlan: Set<string>, limit = 2): T[] {
  return all
    .filter((t) => !inPlan.has(t.id))
    .sort((a, b) => EVIDENCE_ORDER[a.evidence] - EVIDENCE_ORDER[b.evidence] || a.title.localeCompare(b.title))
    .slice(0, limit);
}
