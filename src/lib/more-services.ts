// Services for social stories, the bag checklist, the saving goal, goal proposals, the sleep diary,
// the weekly parent report, e-mail settings and the data export. Same rules as services.ts.
import { and, asc, desc, eq, gte, inArray, lte, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import type { MsgKey, Params } from "@/lib/i18n";
import {
  bagDone,
  bagItems,
  chatMessages,
  consents,
  dayNotes,
  goalPins,
  goalProposals,
  healthLogs,
  healthSettings,
  homework,
  homeworkSteps,
  marks,
  moodChecks,
  rewardRequests,
  rewards,
  scaleResponses,
  scheduleDone,
  scheduleItems,
  selfChecks,
  stories,
  trials,
  passports,
  users,
  type GoalPlace,
  type Medication,
  MEDICATION,
} from "@/db/schema";
import { AccessDenied, assertCan, can, type Actor } from "./access";
import * as D from "./domain";
import * as S from "./services";
import { adultsOf, notify } from "./notify";

const err = (key: MsgKey, params?: Params) => new S.UserError([{ key, params }]);

/* =========================== social stories =========================== */

export async function storiesOf(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "VIEW", studentId);
  return db.query.stories.findMany({ where: eq(stories.studentId, studentId), orderBy: desc(stories.createdAt) });
}

export async function saveStory(db: DB, actor: Actor, input: { studentId: string; title: string; steps: string }) {
  await assertCan(db, actor, "MANAGE_STORIES", input.studentId);
  const title = input.title.trim();
  if (!title || title.length > 60) throw err("err.storyTitle");
  const steps = D.parseStorySteps(input.steps);
  if (steps.length < 2 || steps.length > D.MAX_STORY_STEPS) throw err("err.storySteps", { max: D.MAX_STORY_STEPS });
  if (steps.some((s) => s.text.length > 140 || s.icon.length > 16)) throw err("err.storyStepLong");
  db.insert(stories).values({ studentId: input.studentId, title, steps, authorId: actor.id }).run();
  S.audit(db, actor, "story.save", input.studentId, { title });
}

export async function deleteStory(db: DB, actor: Actor, input: { studentId: string; storyId: string }) {
  await assertCan(db, actor, "MANAGE_STORIES", input.studentId);
  db.delete(stories).where(and(eq(stories.id, input.storyId), eq(stories.studentId, input.studentId))).run();
  S.audit(db, actor, "story.delete", input.studentId);
}

/* =========================== evening bag checklist =========================== */

export async function bagFor(db: DB, studentId: string, date: string) {
  const items = await db.query.bagItems.findMany({ where: eq(bagItems.studentId, studentId), orderBy: asc(bagItems.position) });
  const done = items.length ? await db.query.bagDone.findMany({ where: and(inArray(bagDone.itemId, items.map((i) => i.id)), eq(bagDone.date, date)) }) : [];
  return { items, doneIds: new Set(done.map((d) => d.itemId)) };
}

export async function saveBagItem(db: DB, actor: Actor, input: { studentId: string; title: string; icon: string }) {
  await assertCan(db, actor, "MANAGE_BAG", input.studentId);
  const title = input.title.trim();
  if (!title || title.length > 40) throw err("err.bagTitle");
  if (!(D.BAG_ICONS as readonly string[]).includes(input.icon)) throw err("err.bagIcon");
  const items = await db.query.bagItems.findMany({ where: eq(bagItems.studentId, input.studentId) });
  if (items.length >= D.MAX_BAG_ITEMS) throw err("err.bagMax", { max: D.MAX_BAG_ITEMS });
  db.insert(bagItems).values({ studentId: input.studentId, title, icon: input.icon, position: items.length }).run();
  S.audit(db, actor, "bag.save", input.studentId, { title });
}

export async function deleteBagItem(db: DB, actor: Actor, input: { studentId: string; itemId: string }) {
  await assertCan(db, actor, "MANAGE_BAG", input.studentId);
  db.delete(bagItems).where(and(eq(bagItems.id, input.itemId), eq(bagItems.studentId, input.studentId))).run();
  S.audit(db, actor, "bag.delete", input.studentId);
}

/** The child ticks an item; when the last one is ticked the parents hear that the bag is packed. */
export async function setBagDone(db: DB, actor: Actor, input: { itemId: string; done: boolean }) {
  const item = await db.query.bagItems.findFirst({ where: eq(bagItems.id, input.itemId) });
  if (!item) throw err("err.bagNotFound");
  await assertCan(db, actor, "DO_BAG", item.studentId);
  const date = S.today();
  const before = await bagFor(db, item.studentId, date);
  const wasComplete = before.items.length > 0 && before.items.every((i) => before.doneIds.has(i.id));
  if (input.done) db.insert(bagDone).values({ itemId: item.id, date }).onConflictDoNothing().run();
  else db.delete(bagDone).where(and(eq(bagDone.itemId, item.id), eq(bagDone.date, date))).run();
  const after = await bagFor(db, item.studentId, date);
  const complete = after.items.every((i) => after.doneIds.has(i.id));
  if (complete && !wasComplete) {
    const { student } = await S.getStudent(db, item.studentId);
    const parents = (await adultsOf(db, item.studentId)).filter((a) => a.role === "PARENT");
    notify(db, parents.map((p) => p.id), "ntf.bagDone", { child: student.displayName }, item.studentId, `/parent?child=${item.studentId}`);
  }
  return { complete };
}

/* =========================== saving goal =========================== */

export async function savingGoal(db: DB, studentId: string) {
  const pin = await db.query.goalPins.findFirst({ where: eq(goalPins.studentId, studentId) });
  if (!pin) return null;
  const reward = await db.query.rewards.findFirst({ where: and(eq(rewards.id, pin.rewardId), eq(rewards.active, true)) });
  if (!reward) return null;
  const { balance } = await S.stars(db, studentId);
  return { reward, ...D.goalProgress(balance, reward.cost) };
}

export async function pinGoal(db: DB, actor: Actor, input: { studentId: string; rewardId: string | null }) {
  await assertCan(db, actor, "MANAGE_REWARDS", input.studentId);
  if (!input.rewardId) {
    db.delete(goalPins).where(eq(goalPins.studentId, input.studentId)).run();
  } else {
    const r = await db.query.rewards.findFirst({ where: and(eq(rewards.id, input.rewardId), eq(rewards.studentId, input.studentId)) });
    if (!r) throw err("err.noReward");
    db.insert(goalPins)
      .values({ studentId: input.studentId, rewardId: r.id, setById: actor.id })
      .onConflictDoUpdate({ target: goalPins.studentId, set: { rewardId: r.id, setById: actor.id } })
      .run();
  }
  S.audit(db, actor, "goal.pin", input.studentId, { rewardId: input.rewardId });
}

/* =========================== goal proposals =========================== */

export async function proposeGoal(db: DB, actor: Actor, input: { studentId: string; adultText: string; childText: string; place: GoalPlace; reason: string }) {
  await assertCan(db, actor, "PROPOSE_GOAL", input.studentId);
  const adultText = input.adultText.trim();
  const childText = input.childText.trim();
  if (!adultText || !childText || adultText.length > 120 || childText.length > 80) throw err("err.proposalText");
  if (input.place !== "SCHOOL" && input.place !== "HOME") throw err("err.proposalText");
  const open = await db.query.goalProposals.findMany({ where: and(eq(goalProposals.studentId, input.studentId), eq(goalProposals.authorId, actor.id), eq(goalProposals.status, "PROPOSED")) });
  if (open.length >= 3) throw err("err.proposalMax");
  db.insert(goalProposals).values({ studentId: input.studentId, authorId: actor.id, adultText, childText, place: input.place, reason: input.reason.trim().slice(0, 300) }).run();
  const { student } = await S.getStudent(db, input.studentId);
  const psychs = (await adultsOf(db, input.studentId, actor.id)).filter((a) => a.role === "PSYCHOLOGIST");
  notify(db, psychs.map((p) => p.id), "ntf.proposal", { child: student.displayName }, input.studentId, `/psych/student/${input.studentId}`);
  S.audit(db, actor, "proposal.create", input.studentId);
}

/** The psychologist sees every open proposal; parents and teachers see their own with the decision. */
export async function proposalsOf(db: DB, actor: Actor, studentId: string) {
  const all = await can(db, actor, "EDIT_PLAN", studentId);
  if (!all) await assertCan(db, actor, "PROPOSE_GOAL", studentId);
  return db
    .select({ p: goalProposals, author: users.name, role: users.role })
    .from(goalProposals)
    .innerJoin(users, eq(users.id, goalProposals.authorId))
    .where(all ? and(eq(goalProposals.studentId, studentId), eq(goalProposals.status, "PROPOSED")) : and(eq(goalProposals.studentId, studentId), eq(goalProposals.authorId, actor.id)))
    .orderBy(desc(goalProposals.createdAt));
}

export async function decideProposals(db: DB, actor: Actor, input: { studentId: string; ids: string[]; adopt: boolean }) {
  await assertCan(db, actor, "EDIT_PLAN", input.studentId);
  if (!input.ids.length) return;
  const rows = await db.query.goalProposals.findMany({
    where: and(inArray(goalProposals.id, input.ids), eq(goalProposals.studentId, input.studentId), eq(goalProposals.status, "PROPOSED")),
  });
  const status = input.adopt ? "ADOPTED" : "DISMISSED";
  for (const r of rows) db.update(goalProposals).set({ status }).where(eq(goalProposals.id, r.id)).run();
  const { student } = await S.getStudent(db, input.studentId);
  for (const r of rows)
    notify(db, [r.authorId], input.adopt ? "ntf.proposalAdopted" : "ntf.proposalDismissed", { child: student.displayName }, input.studentId, null);
  S.audit(db, actor, input.adopt ? "proposal.adopt" : "proposal.dismiss", input.studentId, { n: rows.length });
}

/* =========================== sleep and medication diary =========================== */

export async function healthEnabled(db: DB, studentId: string) {
  return Boolean((await db.query.healthSettings.findFirst({ where: eq(healthSettings.studentId, studentId) }))?.enabled);
}

/** Turning the diary off deletes what was written in it. */
export async function setHealthEnabled(db: DB, actor: Actor, input: { studentId: string; enabled: boolean }) {
  await assertCan(db, actor, "MANAGE_HEALTH", input.studentId);
  db.transaction((tx) => {
    tx.insert(healthSettings)
      .values({ studentId: input.studentId, enabled: input.enabled, changedById: actor.id, changedAt: new Date() })
      .onConflictDoUpdate({ target: healthSettings.studentId, set: { enabled: input.enabled, changedById: actor.id, changedAt: new Date() } })
      .run();
    if (!input.enabled) tx.delete(healthLogs).where(eq(healthLogs.studentId, input.studentId)).run();
  });
  S.audit(db, actor, input.enabled ? "health.enable" : "health.disable", input.studentId);
}

export async function logHealth(db: DB, actor: Actor, input: { studentId: string; date: string; sleepHours: number | null; medication: string | null }) {
  await assertCan(db, actor, "MANAGE_HEALTH", input.studentId);
  if (!(await healthEnabled(db, input.studentId))) throw err("err.healthOff");
  const today = S.today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > today || input.date < D.addDays(today, -7)) throw err("err.healthDate");
  if (input.sleepHours !== null && !D.validSleep(input.sleepHours)) throw err("err.sleep");
  if (input.medication !== null && !(MEDICATION as readonly string[]).includes(input.medication)) throw err("err.medication");
  if (input.sleepHours === null && input.medication === null) throw err("err.healthEmpty");
  const values = { sleepHours: input.sleepHours, medication: input.medication as Medication | null, authorId: actor.id };
  db.insert(healthLogs)
    .values({ studentId: input.studentId, date: input.date, ...values })
    .onConflictDoUpdate({ target: [healthLogs.studentId, healthLogs.date], set: values })
    .run();
  S.audit(db, actor, "health.log", input.studentId, { date: input.date });
}

export async function healthOf(db: DB, actor: Actor, studentId: string, days = 28) {
  await assertCan(db, actor, "VIEW_HEALTH", studentId);
  if (!(await healthEnabled(db, studentId))) return null;
  const from = D.addDays(S.today(), -days);
  const logs = await db.query.healthLogs.findMany({ where: and(eq(healthLogs.studentId, studentId), gte(healthLogs.date, from)), orderBy: desc(healthLogs.date) });
  const schoolMarks = (await S.marksBetween(db, studentId, from, S.today())).filter((m) => m.lessonNo > 0);
  // Sleep is written for the night before the school day with the same date.
  const pairs = logs.map((l) => ({ sleep: l.sleepHours, ratio: D.tally(schoolMarks.filter((m) => m.date === l.date)).ratio }));
  return { logs, analysis: D.sleepVsDay(pairs) };
}

/* =========================== weekly parent report =========================== */

export async function weekReport(db: DB, actor: Actor, studentId: string, monday: string) {
  await assertCan(db, actor, "VIEW_REPORT", studentId);
  const friday = D.addDays(monday, 4);
  const lastMonday = D.addDays(monday, -7);
  const [plan, week, lastWeek, series, moods, notes, sched] = await Promise.all([
    S.planFor(db, studentId, friday),
    S.weekSummary(db, studentId, monday),
    S.weekSummary(db, studentId, lastMonday),
    S.goalSeries(db, studentId, 2, friday),
    db.query.moodChecks.findMany({ where: and(eq(moodChecks.studentId, studentId), gte(moodChecks.date, lastMonday), lte(moodChecks.date, D.addDays(monday, 6))) }),
    db
      .select({ text: dayNotes.text, date: dayNotes.date, author: users.name, role: users.role })
      .from(dayNotes)
      .innerJoin(users, eq(users.id, dayNotes.authorId))
      .where(and(eq(dayNotes.studentId, studentId), gte(dayNotes.date, monday), lte(dayNotes.date, friday), ne(dayNotes.text, "")))
      .orderBy(asc(dayNotes.date)),
    db.query.scheduleItems.findMany({ where: eq(scheduleItems.studentId, studentId) }),
  ]);
  const goals = series.goals.map((g, i) => {
    const now = series.weeks[1]?.ratios[i] ?? null;
    const before = series.weeks[0]?.ratios[i] ?? null;
    return { goal: g, now, before, trend: D.trend(now, before) };
  });
  const threshold = (plan?.thresholdPct ?? 70) / 100;
  const rated = goals.filter((g) => g.now !== null);
  const best = [...rated].sort((a, b) => b.now! - a.now!)[0] ?? null;
  const hard = rated.filter((g) => g.now! < threshold && g !== best);

  const weekMarks = await S.marksBetween(db, studentId, monday, friday);
  const [{ sc }] = await db
    .select({ sc: sql<number>`count(*)` })
    .from(selfChecks)
    .where(and(eq(selfChecks.studentId, studentId), eq(selfChecks.starAwarded, true), gte(selfChecks.date, monday), lte(selfChecks.date, D.addDays(monday, 6))));
  const starsEarned = weekMarks.filter((m) => m.value === "YES").length + sc;

  const days7 = Array.from({ length: 7 }, (_, i) => D.addDays(monday, i)).filter((d) => d <= S.today());
  const planned = days7.flatMap((d) => sched.filter((i) => i.weekday === D.weekday(d)).map((i) => ({ id: i.id, date: d })));
  const doneRows = planned.length ? await db.query.scheduleDone.findMany({ where: and(inArray(scheduleDone.itemId, [...new Set(planned.map((p) => p.id))]), gte(scheduleDone.date, monday)) }) : [];
  const scheduleDoneCount = planned.filter((p) => doneRows.some((r) => r.itemId === p.id && r.date === p.date)).length;

  const moodNow = D.moodAverage(moods.filter((m) => m.date >= monday).map((m) => m.mood));
  const moodBefore = D.moodAverage(moods.filter((m) => m.date < monday).map((m) => m.mood));
  const { student } = await S.getStudent(db, studentId);
  S.audit(db, actor, "week_report.view", studentId, { monday });
  return {
    student,
    plan,
    monday,
    week,
    successDays: week.filter((d) => d.success).length,
    ratedDays: week.filter((d) => d.tally.ratio !== null).length,
    lastSuccessDays: lastWeek.filter((d) => d.success).length,
    goals,
    best,
    hard,
    starsEarned,
    schedule: { planned: planned.length, done: scheduleDoneCount },
    mood: { now: moodNow, before: moodBefore },
    notes,
  };
}

/* =========================== e-mail settings =========================== */

export async function setEmailPrefs(db: DB, actor: Actor, input: { email: string; notify: boolean; lang: string }) {
  if (actor.role === "STUDENT") throw new AccessDenied();
  const email = input.email.trim().toLowerCase();
  if (email && !D.isEmail(email)) throw err("err.email");
  if (input.notify && !email) throw err("err.emailNeeded");
  const lang = input.lang === "kk" ? "kk" : "ru";
  db.update(users).set({ email: email || null, emailNotify: input.notify, emailLang: lang }).where(eq(users.id, actor.id)).run();
  S.audit(db, actor, "account.email", null, { notify: input.notify });
}

/* =========================== data export =========================== */

/** Everything stored about one child, for the parent who asks for it (right of access to personal data). */
export async function exportStudentData(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "EXPORT_DATA", studentId);
  const { student, cls, school } = await S.getStudent(db, studentId);
  const hw = await db.query.homework.findMany({ where: eq(homework.studentId, studentId) });
  const data = {
    exportedAt: new Date().toISOString(),
    student: { name: student.displayName, birthYear: student.birthYear, class: cls.name, school: school.name },
    consents: await db.query.consents.findMany({ where: eq(consents.studentId, studentId) }),
    plans: await S.plansOf(db, studentId),
    marks: await db.query.marks.findMany({ where: eq(marks.studentId, studentId), orderBy: asc(marks.date) }),
    dayNotes: await db.select({ date: dayNotes.date, text: dayNotes.text, author: users.name }).from(dayNotes).innerJoin(users, eq(users.id, dayNotes.authorId)).where(eq(dayNotes.studentId, studentId)),
    selfChecks: await db.query.selfChecks.findMany({ where: eq(selfChecks.studentId, studentId) }),
    rewards: await db.query.rewards.findMany({ where: eq(rewards.studentId, studentId) }),
    rewardRequests: await db.query.rewardRequests.findMany({ where: eq(rewardRequests.studentId, studentId) }),
    homework: hw,
    homeworkSteps: hw.length ? await db.query.homeworkSteps.findMany({ where: inArray(homeworkSteps.homeworkId, hw.map((h) => h.id)) }) : [],
    moods: await db.query.moodChecks.findMany({ where: eq(moodChecks.studentId, studentId) }),
    schedule: await db.query.scheduleItems.findMany({ where: eq(scheduleItems.studentId, studentId) }),
    bag: await db.query.bagItems.findMany({ where: eq(bagItems.studentId, studentId) }),
    stories: await db.query.stories.findMany({ where: eq(stories.studentId, studentId) }),
    messages: await db.select({ at: chatMessages.createdAt, text: chatMessages.text, author: users.name }).from(chatMessages).innerJoin(users, eq(users.id, chatMessages.authorId)).where(eq(chatMessages.studentId, studentId)),
    // Only the parent's own observation forms: other adults' answers are their personal data.
    myScaleForms: await db.query.scaleResponses.findMany({ where: and(eq(scaleResponses.studentId, studentId), eq(scaleResponses.respondentId, actor.id)) }),
    healthDiary: await db.query.healthLogs.findMany({ where: eq(healthLogs.studentId, studentId) }),
    trials: await db.query.trials.findMany({ where: eq(trials.studentId, studentId) }),
    passport: (await db.query.passports.findFirst({ where: eq(passports.studentId, studentId) })) ?? null,
  };
  S.audit(db, actor, "data.export", studentId);
  return data;
}
