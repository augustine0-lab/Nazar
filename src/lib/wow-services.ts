// «Моя четверть в сторис» and «Карта трудных минут». Same rules as services.ts: every call checks access.
// Nothing new is stored: both are read from marks, homework steps, self-checks, moods, the sleep diary and notes.
import { and, eq, gte, isNotNull, lte, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { dayNotes, homework, homeworkSteps, moodChecks, selfChecks } from "@/db/schema";
import { AccessDenied, assertCan, can, relationTo, type Actor } from "./access";
import * as D from "./domain";
import * as S from "./services";
import * as F from "./feature-services";
import * as M from "./more-services";
import { adultsOf, notify } from "./notify";

/* =========================== the quarter in stories =========================== */

const startOf = (date: string) => new Date(date + "T00:00:00+05:00");
const endOf = (date: string) => new Date(date + "T23:59:59+05:00");

export async function recapOf(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "VIEW", studentId);
  const { student } = await S.getStudent(db, studentId);
  const period = D.recapPeriod(S.today());
  const { from, to } = period;
  const [marks, checks, steps, moods, pet, plans] = await Promise.all([
    S.marksBetween(db, studentId, from, to),
    db.query.selfChecks.findMany({ where: and(eq(selfChecks.studentId, studentId), gte(selfChecks.date, from), lte(selfChecks.date, to)) }),
    db
      .select({ id: homeworkSteps.id })
      .from(homeworkSteps)
      .innerJoin(homework, eq(homework.id, homeworkSteps.homeworkId))
      .where(and(eq(homework.studentId, studentId), isNotNull(homeworkSteps.doneAt), gte(homeworkSteps.doneAt, startOf(from)), lte(homeworkSteps.doneAt, endOf(to)))),
    db.query.moodChecks.findMany({ where: and(eq(moodChecks.studentId, studentId), gte(moodChecks.date, from), lte(moodChecks.date, to)) }),
    F.petOf(db, studentId),
    S.plansOf(db, studentId),
  ]);
  const plan = D.planForDate(plans, to);
  const threshold = plan?.thresholdPct ?? 70;
  const school = marks.filter((m) => m.lessonNo > 0);
  const dates = [...new Set(school.map((m) => m.date))].sort();
  const weeks = Math.max(2, Math.min(14, Math.ceil((Date.parse(to) - Date.parse(from)) / (7 * 86_400_000)) + 1));
  const series = await S.goalSeries(db, studentId, weeks, to);
  const growth = D.topGrowth(series.goals, series.weeks);

  const slides = D.recapSlides({
    stars: marks.filter((m) => m.value === "YES").length + checks.filter((c) => c.starAwarded).length,
    steps: steps.length,
    onTask: checks.filter((c) => c.onTask).length,
    streak: D.longestStreak(dates.map((d) => D.tally(school.filter((m) => m.date === d))), threshold),
    bestWeekday: D.bestWeekday(school, D.weekday),
    growth: growth ? { text: growth.goal.childText, from: growth.from, to: growth.to } : null,
    pet: pet.pet ? { name: pet.pet.name, kind: pet.pet.kind, stage: pet.stage } : null,
    goodMoods: moods.filter((m) => m.mood >= 4).length,
  });
  return {
    student,
    period,
    slides,
    goals: (plan?.goals ?? []).map((g) => ({ id: g.id, text: g.childText })),
  };
}

/** The child picks the goal for the next quarter on the last story; the parents and the psychologist hear of it. */
export async function chooseRecapGoal(db: DB, actor: Actor, input: { studentId: string; goalId: string }) {
  if ((await relationTo(db, actor, input.studentId)) !== "SELF") throw new AccessDenied();
  const plan = D.planForDate(await S.plansOf(db, input.studentId), S.today());
  const goal = plan?.goals.find((g) => g.id === input.goalId);
  if (!goal) throw new AccessDenied();
  const { student } = await S.getStudent(db, input.studentId);
  const adults = await adultsOf(db, input.studentId, actor.id);
  const params = { child: student.displayName, goal: goal.childText };
  notify(db, adults.filter((a) => a.role === "PARENT").map((a) => a.id), "ntf.recapGoal", params, input.studentId, `/parent/recap?child=${input.studentId}`);
  notify(db, adults.filter((a) => a.role === "PSYCHOLOGIST").map((a) => a.id), "ntf.recapGoal", params, input.studentId, `/psych/student/${input.studentId}`);
  return { goal: goal.childText };
}

/* =========================== the map of hard minutes =========================== */

/** Weeks of marks the map looks at. */
export const HARD_WEEKS = 6;

export async function hardMapOf(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "VIEW", studentId);
  const to = S.today();
  const from = D.addDays(to, -7 * HARD_WEEKS);
  const [marks, moods, notes, health] = await Promise.all([
    S.marksBetween(db, studentId, from, to),
    F.moodsOf(db, studentId, from),
    db
      .select({ date: dayNotes.date, text: dayNotes.text })
      .from(dayNotes)
      .where(and(eq(dayNotes.studentId, studentId), gte(dayNotes.date, from), lte(dayNotes.date, to), ne(dayNotes.text, ""))),
    (await can(db, actor, "VIEW_HEALTH", studentId)) ? M.healthOf(db, actor, studentId, 7 * HARD_WEEKS) : Promise.resolve(null),
  ]);
  const shortSleep = new Set((health?.logs ?? []).filter((l) => l.sleepHours !== null && l.sleepHours < D.SHORT_SLEEP_HOURS).map((l) => l.date));
  const lowMood = new Set(moods.filter((m) => m.slot === "MORNING" && m.mood <= D.LOW_MOOD).map((m) => m.date));
  const all = D.hardGrid(marks, D.weekday);
  return {
    from,
    lessons: all.lessons,
    layers: {
      all: all.cells,
      sleep: health ? D.hardGrid(marks, D.weekday, (d) => shortSleep.has(d)).cells : null,
      mood: lowMood.size ? D.hardGrid(marks, D.weekday, (d) => lowMood.has(d)).cells : null,
    },
    shortSleepDays: shortSleep.size,
    lowMoodDays: lowMood.size,
    notes: notes.reduce<Record<string, string[]>>((acc, n) => ((acc[n.date] ??= []).push(n.text), acc), {}),
  };
}
