// Application services: every read and write of a child's data goes through here,
// with the access check and the audit record next to the change itself.
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import type { DB } from "@/db";
import { translate, type Msg, type MsgKey, type Params } from "@/lib/i18n";
import {
  auditLog,
  chatMessages,
  classGroups,
  consents,
  dayNotes,
  goals,
  guardianships,
  homework,
  homeworkSteps,
  marks,
  moodChecks,
  notifications,
  stories,
  bagItems,
  goalPins,
  goalProposals,
  healthLogs,
  healthSettings,
  planTechniques,
  psychAssignments,
  rewardRequests,
  rewards,
  scaleResponses,
  scheduleItems,
  schools,
  selfChecks,
  students,
  supportPlans,
  techniques,
  users,
  type MarkValue,
  type Role,
} from "@/db/schema";
import { AccessDenied, assertCan, can, type Actor } from "./access";
import * as D from "./domain";
import { adultsOf, notify } from "./notify";
import { hashPassword, isPin } from "./password";

/** Carries messages by key so the action layer can show them in the reader's language. */
export class UserError extends Error {
  constructor(public readonly msgs: Msg[]) {
    super(msgs.map((m) => translate("ru", m.key, m.params)).join(" "));
  }
}
const userError = (key: MsgKey, params?: Params) => new UserError([{ key, params }]);

export const CONSENT_TEXT_VERSION = "2026-10";
export const PURGE_AFTER_DAYS = 30;

export function audit(db: DB, actor: Actor, action: string, studentId: string | null, details?: Record<string, unknown>) {
  db.insert(auditLog).values({ actorId: actor.id, studentId, action, details }).run();
}

export const today = () => D.isoDate(new Date());
export const nowLocal = () => D.localTime(new Date());

/* =========================== reads =========================== */

export async function getStudent(db: DB, studentId: string) {
  const [row] = await db
    .select({ student: students, cls: classGroups, school: schools })
    .from(students)
    .innerJoin(classGroups, eq(classGroups.id, students.classId))
    .innerJoin(schools, eq(schools.id, classGroups.schoolId))
    .where(eq(students.id, studentId));
  if (!row) throw userError("err.studentNotFound");
  return row;
}

export async function studentsForActor(db: DB, actor: Actor) {
  const base = db
    .select({ id: students.id, displayName: students.displayName, className: classGroups.name })
    .from(students)
    .innerJoin(classGroups, eq(classGroups.id, students.classId));
  switch (actor.role) {
    case "TEACHER":
      return base.where(eq(classGroups.teacherId, actor.id)).orderBy(asc(students.displayName));
    case "PARENT":
      return base
        .innerJoin(guardianships, eq(guardianships.studentId, students.id))
        .where(eq(guardianships.parentId, actor.id))
        .orderBy(asc(students.displayName));
    case "PSYCHOLOGIST":
      return base
        .innerJoin(psychAssignments, eq(psychAssignments.studentId, students.id))
        .where(eq(psychAssignments.psychologistId, actor.id))
        .orderBy(asc(students.displayName));
    case "STUDENT":
      return base.where(eq(students.userId, actor.id));
    default:
      return [];
  }
}

export type PlanWithGoals = typeof supportPlans.$inferSelect & {
  goals: (typeof goals.$inferSelect)[];
  techniques: (typeof techniques.$inferSelect)[];
};

export async function plansOf(db: DB, studentId: string): Promise<PlanWithGoals[]> {
  const plans = await db.query.supportPlans.findMany({ where: eq(supportPlans.studentId, studentId), orderBy: desc(supportPlans.version) });
  if (!plans.length) return [];
  const ids = plans.map((p) => p.id);
  const g = await db.query.goals.findMany({ where: inArray(goals.planId, ids), orderBy: asc(goals.position) });
  const t = await db
    .select({ planId: planTechniques.planId, technique: techniques })
    .from(planTechniques)
    .innerJoin(techniques, eq(techniques.id, planTechniques.techniqueId))
    .where(inArray(planTechniques.planId, ids));
  return plans.map((p) => ({
    ...p,
    goals: g.filter((x) => x.planId === p.id),
    techniques: t.filter((x) => x.planId === p.id).map((x) => x.technique),
  }));
}

export async function planFor(db: DB, studentId: string, date: string) {
  return D.planForDate(await plansOf(db, studentId), date);
}

export async function marksBetween(db: DB, studentId: string, from: string, to: string) {
  return db.query.marks.findMany({ where: and(eq(marks.studentId, studentId), gte(marks.date, from), lte(marks.date, to)) });
}

export async function daySummary(db: DB, studentId: string, date: string) {
  const plan = await planFor(db, studentId, date);
  const dayMarks = await marksBetween(db, studentId, date, date);
  const notes = await db
    .select({ note: dayNotes, author: users.name, authorRole: users.role })
    .from(dayNotes)
    .innerJoin(users, eq(users.id, dayNotes.authorId))
    .where(and(eq(dayNotes.studentId, studentId), eq(dayNotes.date, date)));
  const t = D.tally(dayMarks);
  const goalIds = plan?.goals.map((g) => g.id) ?? [];
  const teacherNote = notes.find((n) => n.authorRole === "TEACHER");
  return {
    plan,
    marks: dayMarks,
    tally: t,
    byGoal: D.tallyByGoal(dayMarks, goalIds),
    success: plan ? D.isSuccessfulDay(t, plan.thresholdPct) : false,
    notes,
    closed: D.isDayClosed(date, teacherNote?.note.closedAt, today(), nowLocal()),
  };
}

export async function weekSummary(db: DB, studentId: string, monday: string) {
  const days = D.schoolDaysOfWeek(monday);
  const all = await marksBetween(db, studentId, days[0], days[4]);
  const plans = await plansOf(db, studentId);
  return days.map((date) => {
    const t = D.tally(all.filter((m) => m.date === date));
    const plan = D.planForDate(plans, date);
    return { date, tally: t, success: plan ? D.isSuccessfulDay(t, plan.thresholdPct) : false };
  });
}

/** Weekly share of YES for each goal of the current plan, oldest week first; goals are matched by lineage across plan versions. */
export async function goalSeries(db: DB, studentId: string, weeks: number, onDate = today()) {
  const plans = await plansOf(db, studentId);
  const current = D.planForDate(plans, onDate) ?? plans.find((p) => p.status === "PENDING") ?? null;
  if (!current) return { goals: [], weeks: [] as { monday: string; ratios: (number | null)[] }[] };
  const goalLineage = new Map<string, string>();
  for (const p of plans) for (const g of p.goals) goalLineage.set(g.id, g.lineageId);
  const thisMonday = D.mondayOf(onDate);
  const mondays = Array.from({ length: weeks }, (_, i) => D.addDays(thisMonday, -7 * (weeks - 1 - i)));
  const all = await marksBetween(db, studentId, mondays[0], D.addDays(thisMonday, 4));
  return {
    goals: current.goals,
    weeks: mondays.map((monday) => {
      const inWeek = all.filter((m) => m.date >= monday && m.date <= D.addDays(monday, 4));
      return {
        monday,
        ratios: current.goals.map((g) => D.tally(inWeek.filter((m) => goalLineage.get(m.goalId) === g.lineageId)).ratio),
      };
    }),
  };
}

export async function stars(db: DB, studentId: string, date = today()) {
  const [{ yes }] = await db
    .select({ yes: sql<number>`count(*)` })
    .from(marks)
    .where(and(eq(marks.studentId, studentId), eq(marks.value, "YES")));
  const [{ sc }] = await db
    .select({ sc: sql<number>`count(*)` })
    .from(selfChecks)
    .where(and(eq(selfChecks.studentId, studentId), eq(selfChecks.starAwarded, true)));
  const granted = await db.query.rewardRequests.findMany({
    where: and(eq(rewardRequests.studentId, studentId), eq(rewardRequests.status, "GRANTED")),
  });
  const [{ yesToday }] = await db
    .select({ yesToday: sql<number>`count(*)` })
    .from(marks)
    .where(and(eq(marks.studentId, studentId), eq(marks.value, "YES"), eq(marks.date, date)));
  const [{ scToday }] = await db
    .select({ scToday: sql<number>`count(*)` })
    .from(selfChecks)
    .where(and(eq(selfChecks.studentId, studentId), eq(selfChecks.starAwarded, true), eq(selfChecks.date, date)));
  return {
    balance: D.starBalance({ yesMarks: yes, selfCheckStars: sc, grantedCosts: granted.map((g) => g.costAtGrant ?? 0) }),
    earnedToday: yesToday + scToday,
    selfCheckStarsToday: scToday,
  };
}

export async function rewardsOf(db: DB, studentId: string, includeHidden = false) {
  return db.query.rewards.findMany({
    where: includeHidden ? eq(rewards.studentId, studentId) : and(eq(rewards.studentId, studentId), eq(rewards.active, true)),
    orderBy: asc(rewards.cost),
  });
}

export async function rewardRequestsOf(db: DB, studentId: string) {
  return db
    .select({ request: rewardRequests, reward: rewards })
    .from(rewardRequests)
    .innerJoin(rewards, eq(rewards.id, rewardRequests.rewardId))
    .where(eq(rewardRequests.studentId, studentId))
    .orderBy(desc(rewardRequests.createdAt));
}

export async function homeworkOf(db: DB, studentId: string, fromDate = D.addDays(today(), -7)) {
  const hw = await db.query.homework.findMany({
    where: and(eq(homework.studentId, studentId), gte(homework.dueDate, fromDate)),
    orderBy: asc(homework.dueDate),
  });
  if (!hw.length) return [];
  const steps = await db.query.homeworkSteps.findMany({ where: inArray(homeworkSteps.homeworkId, hw.map((h) => h.id)), orderBy: asc(homeworkSteps.position) });
  return hw.map((h) => ({ ...h, steps: steps.filter((s) => s.homeworkId === h.id) }));
}

export async function selfChecksOf(db: DB, studentId: string, from: string) {
  return db.query.selfChecks.findMany({ where: and(eq(selfChecks.studentId, studentId), gte(selfChecks.date, from)), orderBy: desc(selfChecks.createdAt) });
}

export async function consentOf(db: DB, studentId: string) {
  return db.query.consents.findFirst({ where: eq(consents.studentId, studentId), orderBy: desc(consents.givenAt) });
}

/* =========================== guarded entry point =========================== */

export async function viewStudent(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "VIEW", studentId);
  return getStudent(db, studentId);
}

/* =========================== marks and notes =========================== */

export async function setMark(
  db: DB,
  actor: Actor,
  input: { studentId: string; goalId: string; date: string; lessonNo: number; value: MarkValue | null },
) {
  const { studentId, goalId, date, lessonNo, value } = input;
  const plan = await planFor(db, studentId, date);
  const goal = plan?.goals.find((g) => g.id === goalId);
  if (!plan || !goal) throw userError("err.goalNotInPlan");

  if (goal.place === "SCHOOL") {
    await assertCan(db, actor, "MARK", studentId);
    const { school } = await getStudent(db, studentId);
    if (lessonNo < 1 || lessonNo > school.bellSchedule.length) throw userError("err.noSuchLesson");
  } else {
    await assertCan(db, actor, "AWARD_HOME_GOAL", studentId);
    if (lessonNo !== 0) throw userError("err.homeGoalOnce");
  }
  if (!D.isSchoolDay(date)) throw userError("err.schoolDaysOnly");
  if (!D.canEditMarksFor(date, today())) throw userError("err.marksWindow");

  const where = and(eq(marks.studentId, studentId), eq(marks.date, date), eq(marks.lessonNo, lessonNo), eq(marks.goalId, goalId));
  if (value === null) {
    db.delete(marks).where(where).run();
  } else {
    db.insert(marks)
      .values({ studentId, goalId, date, lessonNo, value, authorId: actor.id })
      .onConflictDoUpdate({ target: [marks.studentId, marks.date, marks.lessonNo, marks.goalId], set: { value, authorId: actor.id, updatedAt: new Date() } })
      .run();
  }
  audit(db, actor, "mark.set", studentId, { goalId, date, lessonNo, value });
}

export async function saveDayNote(db: DB, actor: Actor, input: { studentId: string; date: string; text: string; close: boolean }) {
  await assertCan(db, actor, "WRITE_NOTE", input.studentId);
  const text = input.text.trim().slice(0, 1000);
  const closedAt = input.close && actor.role === "TEACHER" ? new Date() : null;
  db.insert(dayNotes)
    .values({ studentId: input.studentId, date: input.date, authorId: actor.id, text, closedAt })
    .onConflictDoUpdate({
      target: [dayNotes.studentId, dayNotes.date, dayNotes.authorId],
      set: closedAt ? { text, closedAt } : { text },
    })
    .run();
  audit(db, actor, input.close ? "day.close" : "note.save", input.studentId, { date: input.date });
  if (closedAt) {
    const { student } = await getStudent(db, input.studentId);
    const parents = (await adultsOf(db, input.studentId, actor.id)).filter((a) => a.role === "PARENT");
    notify(db, parents.map((p) => p.id), "ntf.dayClosed", { child: student.displayName }, input.studentId, `/parent?child=${input.studentId}`);
  }
}

/* =========================== rewards =========================== */

export async function saveReward(db: DB, actor: Actor, input: { studentId: string; rewardId?: string; title: string; cost: number; active: boolean }) {
  await assertCan(db, actor, "MANAGE_REWARDS", input.studentId);
  const title = input.title.trim();
  if (!title) throw userError("err.rewardName");
  if (!Number.isInteger(input.cost) || input.cost < 1 || input.cost > 50) throw userError("err.rewardCost");
  if (input.rewardId) {
    db.update(rewards)
      .set({ title, cost: input.cost, active: input.active })
      .where(and(eq(rewards.id, input.rewardId), eq(rewards.studentId, input.studentId)))
      .run();
  } else {
    db.insert(rewards).values({ studentId: input.studentId, title, cost: input.cost, active: input.active }).run();
  }
  audit(db, actor, "reward.save", input.studentId, { title, cost: input.cost });
}

export async function requestReward(db: DB, actor: Actor, input: { studentId: string; rewardId: string }) {
  await assertCan(db, actor, "REQUEST_REWARD", input.studentId);
  const reward = await db.query.rewards.findFirst({ where: and(eq(rewards.id, input.rewardId), eq(rewards.studentId, input.studentId), eq(rewards.active, true)) });
  if (!reward) throw userError("err.noReward");
  const { balance } = await stars(db, input.studentId);
  if (!D.canRequestReward(balance, reward.cost)) throw userError("err.notEnoughStars");
  const pending = await db.query.rewardRequests.findFirst({
    where: and(eq(rewardRequests.rewardId, reward.id), eq(rewardRequests.status, "PENDING")),
  });
  if (pending) throw userError("err.alreadyRequested");
  db.insert(rewardRequests).values({ rewardId: reward.id, studentId: input.studentId, status: "PENDING" }).run();
  audit(db, actor, "reward.request", input.studentId, { rewardId: reward.id });
  const { student } = await getStudent(db, input.studentId);
  const parents = (await adultsOf(db, input.studentId)).filter((a) => a.role === "PARENT");
  notify(db, parents.map((p) => p.id), "ntf.rewardRequest", { child: student.displayName, reward: reward.title }, input.studentId, `/parent?child=${input.studentId}`);
}

/** Parent grants a reward, either answering a request or directly (requestId omitted). */
export async function grantReward(db: DB, actor: Actor, input: { studentId: string; rewardId: string; requestId?: string }) {
  await assertCan(db, actor, "MANAGE_REWARDS", input.studentId);
  const reward = await db.query.rewards.findFirst({ where: and(eq(rewards.id, input.rewardId), eq(rewards.studentId, input.studentId)) });
  if (!reward) throw userError("err.noReward");
  const { balance } = await stars(db, input.studentId);
  if (balance < reward.cost) throw userError("err.balanceShort", { have: balance, need: reward.cost });
  const decided = { status: "GRANTED" as const, costAtGrant: reward.cost, decidedById: actor.id, decidedAt: new Date() };
  if (input.requestId) {
    db.update(rewardRequests)
      .set(decided)
      .where(and(eq(rewardRequests.id, input.requestId), eq(rewardRequests.studentId, input.studentId), eq(rewardRequests.status, "PENDING")))
      .run();
  } else {
    db.insert(rewardRequests).values({ rewardId: reward.id, studentId: input.studentId, ...decided }).run();
  }
  audit(db, actor, "reward.grant", input.studentId, { rewardId: reward.id, cost: reward.cost });
}

export async function declineRewardRequest(db: DB, actor: Actor, input: { studentId: string; requestId: string }) {
  await assertCan(db, actor, "MANAGE_REWARDS", input.studentId);
  db.update(rewardRequests)
    .set({ status: "DECLINED", decidedById: actor.id, decidedAt: new Date() })
    .where(and(eq(rewardRequests.id, input.requestId), eq(rewardRequests.studentId, input.studentId), eq(rewardRequests.status, "PENDING")))
    .run();
  audit(db, actor, "reward.decline", input.studentId, { requestId: input.requestId });
}

/* =========================== homework =========================== */

export const MAX_STEPS = 12;

export async function createHomework(
  db: DB,
  actor: Actor,
  input: { studentId: string; subject: string; title: string; dueDate: string; steps: string[] },
) {
  await assertCan(db, actor, "CREATE_HOMEWORK", input.studentId);
  const steps = input.steps.map((s) => s.trim()).filter(Boolean);
  if (!input.subject.trim() || !input.title.trim()) throw userError("err.hwFields");
  if (!steps.length) throw userError("err.hwSteps");
  if (steps.length > MAX_STEPS) throw userError("err.hwMaxSteps", { max: MAX_STEPS });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) throw userError("err.hwDue");
  const id = crypto.randomUUID();
  db.transaction((tx) => {
    tx.insert(homework).values({ id, studentId: input.studentId, subject: input.subject.trim(), title: input.title.trim(), dueDate: input.dueDate, authorId: actor.id }).run();
    steps.forEach((text, position) => tx.insert(homeworkSteps).values({ homeworkId: id, text, position }).run());
  });
  audit(db, actor, "homework.create", input.studentId, { homeworkId: id });
  return id;
}

export async function setStepDone(db: DB, actor: Actor, input: { stepId: string; done: boolean }) {
  const [row] = await db
    .select({ step: homeworkSteps, hw: homework })
    .from(homeworkSteps)
    .innerJoin(homework, eq(homework.id, homeworkSteps.homeworkId))
    .where(eq(homeworkSteps.id, input.stepId));
  if (!row) throw userError("err.stepNotFound");
  await assertCan(db, actor, "DO_HOMEWORK", row.hw.studentId);
  db.update(homeworkSteps).set({ doneAt: input.done ? new Date() : null }).where(eq(homeworkSteps.id, input.stepId)).run();
}

export async function recordSelfCheck(db: DB, actor: Actor, input: { studentId: string; homeworkId: string | null; onTask: boolean }) {
  await assertCan(db, actor, "DO_HOMEWORK", input.studentId);
  const date = today();
  const { selfCheckStarsToday } = await stars(db, input.studentId, date);
  const starAwarded = D.selfCheckEarnsStar(input.onTask, selfCheckStarsToday);
  db.insert(selfChecks).values({ studentId: input.studentId, homeworkId: input.homeworkId, date, onTask: input.onTask, starAwarded }).run();
  return { starAwarded };
}

/* =========================== support plan =========================== */

export async function submitPlan(
  db: DB,
  actor: Actor,
  input: D.PlanDraftInput & { studentId: string; goalLineage: (string | null)[]; techniqueIds: string[] },
) {
  await assertCan(db, actor, "EDIT_PLAN", input.studentId);
  const errors = D.validatePlan(input);
  if (errors.length) throw new UserError(errors);
  const existing = await plansOf(db, input.studentId);
  const version = (existing[0]?.version ?? 0) + 1;
  const planId = crypto.randomUUID();
  db.transaction((tx) => {
    // Only one plan waits for approval at a time; a newer submission replaces it.
    tx.update(supportPlans)
      .set({ status: "DRAFT" })
      .where(and(eq(supportPlans.studentId, input.studentId), eq(supportPlans.status, "PENDING")))
      .run();
    tx.insert(supportPlans)
      .values({
        id: planId,
        studentId: input.studentId,
        version,
        status: "PENDING",
        thresholdPct: input.thresholdPct,
        workMinutes: input.workMinutes,
        breakMinutes: input.breakMinutes,
        authorId: actor.id,
      })
      .run();
    input.goals.forEach((g, position) =>
      tx.insert(goals)
        .values({
          planId,
          lineageId: input.goalLineage[position] ?? crypto.randomUUID(),
          adultText: g.adultText.trim(),
          childText: g.childText.trim(),
          place: g.place,
          position,
        })
        .run(),
    );
    for (const techniqueId of new Set(input.techniqueIds)) tx.insert(planTechniques).values({ planId, techniqueId }).run();
  });
  audit(db, actor, "plan.submit", input.studentId, { version });
  const { student } = await getStudent(db, input.studentId);
  const parents = (await adultsOf(db, input.studentId)).filter((a) => a.role === "PARENT");
  notify(db, parents.map((p) => p.id), "ntf.planPending", { child: student.displayName }, input.studentId, `/parent/plan?child=${input.studentId}`);
  return planId;
}

export async function approvePlan(db: DB, actor: Actor, input: { studentId: string; planId: string }) {
  await assertCan(db, actor, "APPROVE_PLAN", input.studentId);
  const plans = await plansOf(db, input.studentId);
  const plan = plans.find((p) => p.id === input.planId && p.status === "PENDING");
  if (!plan) throw userError("err.planNotPending");
  const t = today();
  const hasCurrent = Boolean(D.planForDate(plans, t));
  // A changed plan starts on the next school day so today's marks keep their meaning.
  const effectiveFrom = hasCurrent ? D.nextSchoolDay(t) : t;
  db.transaction((tx) => {
    tx.update(supportPlans).set({ status: "ARCHIVED" }).where(and(eq(supportPlans.studentId, input.studentId), eq(supportPlans.status, "ACTIVE"))).run();
    tx.update(supportPlans)
      .set({ status: "ACTIVE", effectiveFrom, approvedById: actor.id, approvedAt: new Date() })
      .where(eq(supportPlans.id, plan.id))
      .run();
  });
  audit(db, actor, "plan.approve", input.studentId, { version: plan.version, effectiveFrom });
  const { student } = await getStudent(db, input.studentId);
  notify(db, [plan.authorId], "ntf.planApproved", { child: student.displayName }, input.studentId, `/psych/student/${input.studentId}`);
  return effectiveFrom;
}

export async function declinePlan(db: DB, actor: Actor, input: { studentId: string; planId: string }) {
  await assertCan(db, actor, "APPROVE_PLAN", input.studentId);
  db.update(supportPlans)
    .set({ status: "DRAFT" })
    .where(and(eq(supportPlans.id, input.planId), eq(supportPlans.studentId, input.studentId), eq(supportPlans.status, "PENDING")))
    .run();
  audit(db, actor, "plan.decline", input.studentId, { planId: input.planId });
}

export async function allTechniques(db: DB) {
  return db.query.techniques.findMany({ orderBy: asc(techniques.title) });
}

/* =========================== consent =========================== */

export async function giveConsent(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "MANAGE_CONSENT", studentId);
  const active = await db.query.consents.findFirst({ where: and(eq(consents.studentId, studentId), isNull(consents.revokedAt)) });
  if (active) return;
  db.insert(consents).values({ parentId: actor.id, studentId, textVersion: CONSENT_TEXT_VERSION, givenAt: new Date() }).run();
  audit(db, actor, "consent.give", studentId);
}

export async function revokeConsent(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "MANAGE_CONSENT", studentId);
  db.update(consents).set({ revokedAt: new Date() }).where(and(eq(consents.studentId, studentId), isNull(consents.revokedAt))).run();
  audit(db, actor, "consent.revoke", studentId);
}

/** Deletes observations of children whose consent was revoked more than PURGE_AFTER_DAYS ago. Returns affected students. */
export async function purgeRevokedData(db: DB, now = new Date()) {
  const cutoff = new Date(now.getTime() - PURGE_AFTER_DAYS * 86_400_000);
  const revoked = await db.query.consents.findMany({ where: lte(consents.revokedAt, cutoff) });
  const purged: string[] = [];
  for (const c of revoked) {
    const stillActive = await db.query.consents.findFirst({ where: and(eq(consents.studentId, c.studentId), isNull(consents.revokedAt)) });
    if (stillActive) continue;
    db.transaction((tx) => {
      tx.delete(marks).where(eq(marks.studentId, c.studentId)).run();
      tx.delete(dayNotes).where(eq(dayNotes.studentId, c.studentId)).run();
      tx.delete(selfChecks).where(eq(selfChecks.studentId, c.studentId)).run();
      tx.delete(rewardRequests).where(eq(rewardRequests.studentId, c.studentId)).run();
      tx.delete(homework).where(eq(homework.studentId, c.studentId)).run();
      tx.delete(moodChecks).where(eq(moodChecks.studentId, c.studentId)).run();
      tx.delete(chatMessages).where(eq(chatMessages.studentId, c.studentId)).run();
      tx.delete(scaleResponses).where(eq(scaleResponses.studentId, c.studentId)).run();
      tx.delete(scheduleItems).where(eq(scheduleItems.studentId, c.studentId)).run();
      tx.delete(notifications).where(eq(notifications.studentId, c.studentId)).run();
      tx.delete(stories).where(eq(stories.studentId, c.studentId)).run();
      tx.delete(bagItems).where(eq(bagItems.studentId, c.studentId)).run();
      tx.delete(goalPins).where(eq(goalPins.studentId, c.studentId)).run();
      tx.delete(goalProposals).where(eq(goalProposals.studentId, c.studentId)).run();
      tx.delete(healthLogs).where(eq(healthLogs.studentId, c.studentId)).run();
      tx.delete(healthSettings).where(eq(healthSettings.studentId, c.studentId)).run();
    });
    purged.push(c.studentId);
  }
  return [...new Set(purged)];
}

/* =========================== school administration =========================== */

function assertAdmin(actor: Actor) {
  if (actor.role !== "ADMIN") throw new AccessDenied();
}

export async function schoolOverview(db: DB, actor: Actor) {
  assertAdmin(actor);
  const people = await db.query.users.findMany({ where: eq(users.schoolId, actor.schoolId), orderBy: asc(users.name) });
  const classes = await db.query.classGroups.findMany({ where: eq(classGroups.schoolId, actor.schoolId), orderBy: asc(classGroups.name) });
  const kids = await db
    .select({ student: students, className: classGroups.name })
    .from(students)
    .innerJoin(classGroups, eq(classGroups.id, students.classId))
    .where(eq(classGroups.schoolId, actor.schoolId))
    .orderBy(asc(students.displayName));
  const links = await db.select().from(guardianships);
  const assigns = await db.select().from(psychAssignments);
  return { people, classes, kids, links, assigns };
}

const LOGIN_RE = /^[a-z0-9._-]{3,32}$/;

export async function createAdultUser(db: DB, actor: Actor, input: { login: string; name: string; role: Exclude<Role, "STUDENT">; password: string }) {
  assertAdmin(actor);
  const login = input.login.trim().toLowerCase();
  if (!LOGIN_RE.test(login)) throw userError("err.loginFormat");
  if (input.password.length < 8) throw userError("err.passwordShort");
  if (await db.query.users.findFirst({ where: eq(users.login, login) })) throw userError("err.loginTaken");
  db.insert(users).values({ schoolId: actor.schoolId, login, name: input.name.trim(), role: input.role, passwordHash: hashPassword(input.password) }).run();
  audit(db, actor, "user.create", null, { login, role: input.role });
}

export async function createClass(db: DB, actor: Actor, input: { name: string; schoolYear: string; teacherId: string | null }) {
  assertAdmin(actor);
  if (!input.name.trim()) throw userError("err.className");
  db.insert(classGroups).values({ schoolId: actor.schoolId, name: input.name.trim(), schoolYear: input.schoolYear, teacherId: input.teacherId }).run();
  audit(db, actor, "class.create", null, { name: input.name });
}

export async function createStudentAccount(db: DB, actor: Actor, input: { displayName: string; login: string; pin: string; classId: string; birthYear: number | null }) {
  assertAdmin(actor);
  const login = input.login.trim().toLowerCase();
  if (!LOGIN_RE.test(login)) throw userError("err.loginFormat");
  if (!isPin(input.pin)) throw userError("err.pin");
  if (await db.query.users.findFirst({ where: eq(users.login, login) })) throw userError("err.loginTaken");
  const userId = crypto.randomUUID();
  db.transaction((tx) => {
    tx.insert(users).values({ id: userId, schoolId: actor.schoolId, login, name: input.displayName.trim(), role: "STUDENT", passwordHash: hashPassword(input.pin) }).run();
    tx.insert(students).values({ userId, classId: input.classId, displayName: input.displayName.trim(), birthYear: input.birthYear }).run();
  });
  audit(db, actor, "student.create", null, { login });
}

export async function linkParent(db: DB, actor: Actor, input: { parentId: string; studentId: string; relation: string }) {
  assertAdmin(actor);
  db.insert(guardianships).values(input).onConflictDoNothing().run();
  audit(db, actor, "guardian.link", input.studentId, { parentId: input.parentId });
}

export async function assignPsychologist(db: DB, actor: Actor, input: { psychologistId: string; studentId: string }) {
  assertAdmin(actor);
  db.insert(psychAssignments).values(input).onConflictDoNothing().run();
  audit(db, actor, "psych.assign", input.studentId, { psychologistId: input.psychologistId });
}

export async function resetPassword(db: DB, actor: Actor, input: { userId: string; password: string }) {
  assertAdmin(actor);
  const target = await db.query.users.findFirst({ where: and(eq(users.id, input.userId), eq(users.schoolId, actor.schoolId)) });
  if (!target) throw userError("err.userNotFound");
  if (target.role === "STUDENT" ? !isPin(input.password) : input.password.length < 8)
    throw userError(target.role === "STUDENT" ? "err.pin" : "err.passwordShort");
  db.update(users).set({ passwordHash: hashPassword(input.password), failedLogins: 0, lockedUntil: null }).where(eq(users.id, target.id)).run();
  audit(db, actor, "user.reset_password", null, { userId: target.id });
}

export { can };

/** The school day screens open on: today, or the last school day on weekends. */
export const workDay = () => {
  const t = today();
  return D.isSchoolDay(t) ? t : D.previousSchoolDay(t);
};
