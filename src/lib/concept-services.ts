// Services for trying one technique at a time, the transition passport, moving a pupil to another class
// and the class-wide supports with the lesson board. Same rules as services.ts.
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import type { MsgKey, Params } from "@/lib/i18n";
import {
  classBoards,
  classGroups,
  classSupports,
  consents,
  goals,
  guardianships,
  passports,
  psychAssignments,
  students,
  techniques,
  trials,
  users,
  type TrialDecision,
} from "@/db/schema";
import { AccessDenied, assertCan, type Actor } from "./access";
import * as D from "./domain";
import * as S from "./services";
import { adultsOf, notify } from "./notify";

const err = (key: MsgKey, params?: Params) => new S.UserError([{ key, params }]);

/** Where each adult opens the child: the same notification links to a different page per role. */
const HREF: Record<"PARENT" | "TEACHER" | "PSYCHOLOGIST", (id: string) => string> = {
  PARENT: (id) => `/parent?child=${id}`,
  TEACHER: (id) => `/teacher/student/${id}`,
  PSYCHOLOGIST: (id) => `/psych/student/${id}`,
};

async function tell(db: DB, studentId: string, exceptId: string, kind: MsgKey, params: Params, href?: (id: string) => string) {
  const adults = await adultsOf(db, studentId, exceptId);
  for (const role of ["PARENT", "TEACHER", "PSYCHOLOGIST"] as const) {
    const ids = adults.filter((a) => a.role === role).map((a) => a.id);
    notify(db, ids, kind, params, studentId, (href ?? HREF[role])(studentId));
  }
}

/* =========================== trying a technique =========================== */

/** Share of lessons with the goal met on each date; null when nothing was marked. */
async function dailyRatios(db: DB, studentId: string, dates: string[], lineageId: string | null) {
  if (!dates.length) return [];
  const rows = (await S.marksBetween(db, studentId, dates[0], dates[dates.length - 1])).filter((m) => m.lessonNo > 0);
  let keep = rows;
  if (lineageId) {
    const ids = rows.length ? await db.query.goals.findMany({ where: and(inArray(goals.id, [...new Set(rows.map((m) => m.goalId))]), eq(goals.lineageId, lineageId)) }) : [];
    const set = new Set(ids.map((g) => g.id));
    keep = rows.filter((m) => set.has(m.goalId));
  }
  return dates.map((date) => D.tally(keep.filter((m) => m.date === date)).ratio);
}

async function goalText(db: DB, lineageId: string | null) {
  if (!lineageId) return null;
  const g = await db.query.goals.findFirst({ where: eq(goals.lineageId, lineageId) });
  return g?.adultText ?? null;
}

export type TrialView = Awaited<ReturnType<typeof trialsOf>>[number];

/** Every trial of the child with the before and during days and the comparison, newest first. */
export async function trialsOf(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "VIEW_TRIAL", studentId);
  const rows = await db
    .select({ trial: trials, technique: techniques, author: users.name })
    .from(trials)
    .innerJoin(techniques, eq(techniques.id, trials.techniqueId))
    .innerJoin(users, eq(users.id, trials.authorId))
    .where(eq(trials.studentId, studentId))
    .orderBy(desc(trials.startDate), desc(trials.createdAt));
  const today = S.today();
  return Promise.all(
    rows.map(async ({ trial, technique, author }) => {
      const beforeDates = D.schoolDaysBefore(trial.startDate, D.BASELINE_DAYS);
      const lastDay = trial.status === "DONE" && trial.decidedAt ? D.isoDate(trial.decidedAt) : today;
      const duringDates = D.schoolDaysBetween(trial.startDate, lastDay < trial.endDate ? lastDay : trial.endDate);
      const [before, during, goal] = await Promise.all([
        dailyRatios(db, studentId, beforeDates, trial.lineageId),
        dailyRatios(db, studentId, duringDates, trial.lineageId),
        goalText(db, trial.lineageId),
      ]);
      const schoolDays = D.schoolDaysBetween(trial.startDate, trial.endDate).length;
      return {
        trial,
        technique,
        author,
        goal,
        before: beforeDates.map((date, i) => ({ date, ratio: before[i] })),
        during: duringDates.map((date, i) => ({ date, ratio: during[i] })),
        dayNo: Math.min(duringDates.length, schoolDays),
        schoolDays,
        ended: today > trial.endDate,
        result: D.trialResult(before, during),
      };
    }),
  );
}

export async function runningTrial(db: DB, studentId: string) {
  return db.query.trials.findFirst({ where: and(eq(trials.studentId, studentId), eq(trials.status, "RUNNING")) });
}

export async function startTrial(db: DB, actor: Actor, input: { studentId: string; techniqueId: string; lineageId: string | null; days: number; howTo: string }) {
  await assertCan(db, actor, "RUN_TRIAL", input.studentId);
  // One change at a time, otherwise nobody can tell which change helped.
  if (await runningTrial(db, input.studentId)) throw err("err.trialRunning");
  const technique = await db.query.techniques.findFirst({ where: eq(techniques.id, input.techniqueId) });
  if (!technique) throw err("err.trialTechnique");
  if (!(D.TRIAL_LENGTHS as readonly number[]).includes(input.days)) throw err("err.trialDays");
  if (input.lineageId) {
    const plans = await S.plansOf(db, input.studentId);
    if (!plans.some((p) => p.goals.some((g) => g.lineageId === input.lineageId && g.place === "SCHOOL"))) throw err("err.trialGoal");
  }
  const howTo = input.howTo.trim();
  if (howTo.length > 300) throw err("err.trialHowTo");
  const startDate = D.firstSchoolDay(S.today());
  const endDate = D.nthSchoolDay(startDate, input.days);
  db.insert(trials).values({ studentId: input.studentId, techniqueId: technique.id, lineageId: input.lineageId, howTo, startDate, endDate, authorId: actor.id }).run();
  const { student } = await S.getStudent(db, input.studentId);
  await tell(db, input.studentId, actor.id, "ntf.trialStart", { child: student.displayName, technique: technique.title });
  S.audit(db, actor, "trial.start", input.studentId, { technique: technique.id, days: input.days });
}

async function ownTrial(db: DB, actor: Actor, studentId: string, trialId: string) {
  await assertCan(db, actor, "RUN_TRIAL", studentId);
  const t = await db.query.trials.findFirst({ where: and(eq(trials.id, trialId), eq(trials.studentId, studentId)) });
  if (!t || t.status !== "RUNNING") throw err("err.trialNotFound");
  return t;
}

export async function extendTrial(db: DB, actor: Actor, input: { studentId: string; trialId: string }) {
  const t = await ownTrial(db, actor, input.studentId, input.trialId);
  const endDate = D.nthSchoolDay(D.addDays(t.endDate, 1), D.TRIAL_EXTEND_DAYS);
  db.update(trials).set({ endDate }).where(eq(trials.id, t.id)).run();
  S.audit(db, actor, "trial.extend", input.studentId, { endDate });
}

export async function finishTrial(db: DB, actor: Actor, input: { studentId: string; trialId: string; decision: string; conclusion: string }) {
  const t = await ownTrial(db, actor, input.studentId, input.trialId);
  if (input.decision !== "KEEP" && input.decision !== "DROP") throw err("err.trialDecision");
  const conclusion = input.conclusion.trim();
  if (conclusion.length > 300) throw err("err.trialHowTo");
  db.update(trials).set({ status: "DONE", decision: input.decision as TrialDecision, conclusion, decidedAt: new Date() }).where(eq(trials.id, t.id)).run();
  const technique = (await db.query.techniques.findFirst({ where: eq(techniques.id, t.techniqueId) }))!;
  const { student } = await S.getStudent(db, input.studentId);
  await tell(db, input.studentId, actor.id, input.decision === "KEEP" ? "ntf.trialKeep" : "ntf.trialDrop", { child: student.displayName, technique: technique.title });
  S.audit(db, actor, "trial.finish", input.studentId, { decision: input.decision });
}

/* =========================== transition passport =========================== */

export async function passportOf(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "VIEW_PASSPORT", studentId);
  const today = S.today();
  const [{ student, cls, school }, row, plans, tried, parents, psychs] = await Promise.all([
    S.getStudent(db, studentId),
    db.select({ p: passports, by: users.name, role: users.role }).from(passports).innerJoin(users, eq(users.id, passports.updatedById)).where(eq(passports.studentId, studentId)),
    S.plansOf(db, studentId),
    trialsOf(db, actor, studentId),
    db.select({ name: users.name, relation: guardianships.relation }).from(guardianships).innerJoin(users, eq(users.id, guardianships.parentId)).where(eq(guardianships.studentId, studentId)),
    db.select({ name: users.name }).from(psychAssignments).innerJoin(users, eq(users.id, psychAssignments.psychologistId)).where(eq(psychAssignments.studentId, studentId)),
  ]);
  const teacher = cls.teacherId ? await db.query.users.findFirst({ where: eq(users.id, cls.teacherId) }) : null;
  const monday = D.mondayOf(today);
  const weeks = await Promise.all(
    [3, 2, 1, 0].map(async (back) => {
      const days = await S.weekSummary(db, studentId, D.addDays(monday, -7 * back));
      return { rated: days.filter((d) => d.tally.ratio !== null).length, success: days.filter((d) => d.success).length };
    }),
  );
  S.audit(db, actor, "passport.view", studentId);
  return {
    student,
    cls,
    school,
    teacher: teacher?.name ?? null,
    passport: row[0]?.p ?? null,
    updatedBy: row[0] ? { name: row[0].by, role: row[0].role } : null,
    plan: D.planForDate(plans, today),
    tried: tried.filter((x) => x.trial.status === "DONE"),
    running: tried.find((x) => x.trial.status === "RUNNING") ?? null,
    month: { rated: weeks.reduce((a, w) => a + w.rated, 0), success: weeks.reduce((a, w) => a + w.success, 0) },
    parents,
    psychs: psychs.map((p) => p.name),
  };
}

export async function savePassport(db: DB, actor: Actor, input: { studentId: string } & Record<D.PassportField, string>) {
  await assertCan(db, actor, "EDIT_PASSPORT", input.studentId);
  const values = Object.fromEntries(D.PASSPORT_FIELDS.map((f) => [f, (input[f] ?? "").trim()])) as Record<D.PassportField, string>;
  if (D.PASSPORT_FIELDS.some((f) => values[f].length > D.PASSPORT_MAX)) throw err("err.passportLong", { max: D.PASSPORT_MAX });
  if (D.PASSPORT_FIELDS.every((f) => !values[f])) throw err("err.passportEmpty");
  const set = { ...values, updatedById: actor.id, updatedAt: new Date() };
  db.insert(passports).values({ studentId: input.studentId, ...set }).onConflictDoUpdate({ target: passports.studentId, set }).run();
  S.audit(db, actor, "passport.save", input.studentId);
}

/* =========================== moving a pupil to another class =========================== */

/**
 * The school administrator moves a pupil. The old teacher loses access with the class; the new one
 * is told to read the passport first, and the parents are told who the new teacher is.
 */
export async function moveStudent(db: DB, actor: Actor, input: { studentId: string; classId: string }) {
  if (actor.role !== "ADMIN") throw new AccessDenied();
  const { student, cls, school } = await S.getStudent(db, input.studentId);
  const target = await db.query.classGroups.findFirst({ where: and(eq(classGroups.id, input.classId), eq(classGroups.schoolId, actor.schoolId)) });
  if (school.id !== actor.schoolId || !target) throw err("err.classNotFound");
  if (target.id === cls.id) throw err("err.sameClass");
  db.update(students).set({ classId: target.id }).where(eq(students.id, student.id)).run();
  if (target.teacherId) notify(db, [target.teacherId], "ntf.newStudent", { child: student.displayName, cls: target.name }, student.id, `/passport/${student.id}`);
  const parents = await db.select({ id: guardianships.parentId }).from(guardianships).where(eq(guardianships.studentId, student.id));
  notify(db, parents.map((p) => p.id), "ntf.moved", { child: student.displayName, cls: target.name }, student.id, `/passport/${student.id}`);
  S.audit(db, actor, "student.move", student.id, { from: cls.id, to: target.id });
}

/* =========================== the class as a whole =========================== */

export async function teacherClasses(db: DB, actor: Actor) {
  if (actor.role !== "TEACHER") throw new AccessDenied();
  return db.query.classGroups.findMany({ where: eq(classGroups.teacherId, actor.id), orderBy: asc(classGroups.name) });
}

async function assertClassTeacher(db: DB, actor: Actor, classId: string) {
  const c = await db.query.classGroups.findFirst({ where: and(eq(classGroups.id, classId), eq(classGroups.teacherId, actor.id)) });
  if (actor.role !== "TEACHER" || !c) throw new AccessDenied();
  return c;
}

export async function classSupportsOf(db: DB, actor: Actor, classId: string) {
  await assertClassTeacher(db, actor, classId);
  const rows = await db.query.classSupports.findMany({ where: eq(classSupports.classId, classId) });
  return new Set(rows.map((r) => r.support));
}

export async function setClassSupport(db: DB, actor: Actor, input: { classId: string; support: string; on: boolean }) {
  await assertClassTeacher(db, actor, input.classId);
  if (!D.isUdlSupport(input.support)) throw err("err.udlSupport");
  if (input.on)
    db.insert(classSupports).values({ classId: input.classId, support: input.support, enabledById: actor.id, enabledAt: new Date() }).onConflictDoNothing().run();
  else db.delete(classSupports).where(and(eq(classSupports.classId, input.classId), eq(classSupports.support, input.support))).run();
  S.audit(db, actor, input.on ? "udl.on" : "udl.off", null, { classId: input.classId, support: input.support });
}

/**
 * Techniques from the pupils' current plans, counted without names, with the class-wide support
 * that gives the same help to everyone. When that support is on, no child needs to be singled out.
 */
export async function classNeeds(db: DB, actor: Actor, classId: string) {
  await assertClassTeacher(db, actor, classId);
  const kids = await db
    .select({ id: students.id })
    .from(students)
    .innerJoin(consents, and(eq(consents.studentId, students.id), isNull(consents.revokedAt)))
    .where(eq(students.classId, classId));
  const ids = [...new Set(kids.map((k) => k.id))];
  const enabled = await classSupportsOf(db, actor, classId);
  const count = new Map<string, { technique: typeof techniques.$inferSelect; n: number }>();
  for (const id of ids) {
    const plan = await S.planFor(db, id, S.today());
    for (const tq of plan?.techniques ?? []) {
      const c = count.get(tq.id) ?? { technique: tq, n: 0 };
      c.n++;
      count.set(tq.id, c);
    }
  }
  return {
    pupils: ids.length,
    needs: [...count.values()]
      .map(({ technique, n }) => ({ technique, n, support: technique.classSupport && D.isUdlSupport(technique.classSupport) ? technique.classSupport : null }))
      .map((x) => ({ ...x, covered: x.support ? enabled.has(x.support) : false }))
      .sort((a, b) => b.n - a.n),
  };
}

export async function boardOf(db: DB, actor: Actor, classId: string) {
  await assertClassTeacher(db, actor, classId);
  const b = await db.query.classBoards.findFirst({ where: eq(classBoards.classId, classId) });
  return b?.steps ?? [];
}

export async function saveBoard(db: DB, actor: Actor, input: { classId: string; text: string }) {
  await assertClassTeacher(db, actor, input.classId);
  const steps = D.parseBoardSteps(input.text);
  if (!steps.length || steps.length > D.MAX_BOARD_STEPS) throw err("err.boardSteps", { max: D.MAX_BOARD_STEPS });
  if (steps.some((s) => s.text.length > 80 || s.icon.length > 12)) throw err("err.boardStepLong");
  if (steps.some((s) => s.minutes < 1 || s.minutes > D.MAX_STEP_MINUTES)) throw err("err.boardMinutes", { max: D.MAX_STEP_MINUTES });
  const set = { steps, updatedById: actor.id, updatedAt: new Date() };
  db.insert(classBoards).values({ classId: input.classId, ...set }).onConflictDoUpdate({ target: classBoards.classId, set }).run();
  S.audit(db, actor, "board.save", null, { classId: input.classId, n: steps.length });
}
