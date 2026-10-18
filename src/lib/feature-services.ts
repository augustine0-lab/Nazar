// Services for the schedule, mood, pet, messages, notifications, observation scales,
// the weekly class review and the printable report. Same rules as services.ts:
// the access check and the audit record sit next to the change.
import { and, asc, desc, eq, gt, gte, inArray, ne, sql } from "drizzle-orm";
import type { DB } from "@/db";
import type { MsgKey, Params } from "@/lib/i18n";
import {
  chatMessages,
  chatReads,
  classGroups,
  dayNotes,
  marks,
  moodChecks,
  notifications,
  pets,
  scaleResponses,
  scheduleDone,
  scheduleItems,
  selfChecks,
  users,
  SCHEDULE_ICONS,
  PET_KINDS,
  type MoodSlot,
  type PetKind,
  type ScheduleIcon,
} from "@/db/schema";
import { assertCan, can, type Actor } from "./access";
import * as D from "./domain";
import * as S from "./services";
import { adultsOf, notify } from "./notify";

const err = (key: MsgKey, params?: Params) => new S.UserError([{ key, params }]);

/* =========================== notifications =========================== */

export { adultsOf, notify };

export async function notificationsOf(db: DB, userId: string, limit = 50) {
  return db.query.notifications.findMany({ where: eq(notifications.userId, userId), orderBy: desc(notifications.createdAt), limit });
}

export async function unreadNotifications(db: DB, userId: string) {
  return db.query.notifications.findMany({ where: and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`), orderBy: desc(notifications.createdAt) });
}

export async function markNotificationsRead(db: DB, userId: string) {
  db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), sql`${notifications.readAt} is null`)).run();
}

/* =========================== messages between adults =========================== */

export const MAX_CHAT_LENGTH = 1000;

async function unreadFor(db: DB, userId: string, studentId: string): Promise<number> {
  const read = await db.query.chatReads.findFirst({ where: and(eq(chatReads.userId, userId), eq(chatReads.studentId, studentId)) });
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)` })
    .from(chatMessages)
    .where(and(eq(chatMessages.studentId, studentId), ne(chatMessages.authorId, userId), read ? gt(chatMessages.createdAt, read.readAt) : undefined));
  return n;
}

export async function chatThreads(db: DB, actor: Actor) {
  const kids = await S.studentsForActor(db, actor);
  const rows = [];
  for (const k of kids) {
    if (!(await can(db, actor, "CHAT", k.id))) continue;
    const last = await db.query.chatMessages.findFirst({ where: eq(chatMessages.studentId, k.id), orderBy: desc(chatMessages.createdAt) });
    rows.push({ ...k, last: last ?? null, unread: await unreadFor(db, actor.id, k.id) });
  }
  return rows;
}

export async function totalUnreadChat(db: DB, actor: Actor): Promise<number> {
  if (actor.role === "ADMIN" || actor.role === "STUDENT") return 0;
  return (await chatThreads(db, actor)).reduce((a, r) => a + r.unread, 0);
}

/** Opens the conversation about a child and marks it read for the reader. */
export async function openChat(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "CHAT", studentId);
  const list = await db
    .select({ message: chatMessages, author: users.name, role: users.role })
    .from(chatMessages)
    .innerJoin(users, eq(users.id, chatMessages.authorId))
    .where(eq(chatMessages.studentId, studentId))
    .orderBy(asc(chatMessages.createdAt))
    .limit(200);
  const now = new Date();
  db.insert(chatReads)
    .values({ userId: actor.id, studentId, readAt: now })
    .onConflictDoUpdate({ target: [chatReads.userId, chatReads.studentId], set: { readAt: now } })
    .run();
  // The bell should not keep announcing messages the reader has just read.
  db.update(notifications)
    .set({ readAt: now })
    .where(and(eq(notifications.userId, actor.id), eq(notifications.studentId, studentId), eq(notifications.kind, "ntf.chat"), sql`${notifications.readAt} is null`))
    .run();
  return list;
}

export async function sendChat(db: DB, actor: Actor, input: { studentId: string; text: string }) {
  await assertCan(db, actor, "CHAT", input.studentId);
  const text = input.text.trim();
  if (!text) throw err("err.chatEmpty");
  if (text.length > MAX_CHAT_LENGTH) throw err("err.chatLong", { max: MAX_CHAT_LENGTH });
  db.insert(chatMessages).values({ studentId: input.studentId, authorId: actor.id, text }).run();
  // The sender has read everything up to now.
  const now = new Date();
  db.insert(chatReads)
    .values({ userId: actor.id, studentId: input.studentId, readAt: now })
    .onConflictDoUpdate({ target: [chatReads.userId, chatReads.studentId], set: { readAt: now } })
    .run();
  const { student } = await S.getStudent(db, input.studentId);
  const others = await adultsOf(db, input.studentId, actor.id);
  notify(db, others.map((o) => o.id), "ntf.chat", { child: student.displayName }, input.studentId, `/chat/${input.studentId}`);
  S.audit(db, actor, "chat.send", input.studentId);
}

/* =========================== visual schedule =========================== */

export async function scheduleOf(db: DB, studentId: string) {
  return db.query.scheduleItems.findMany({ where: eq(scheduleItems.studentId, studentId), orderBy: [asc(scheduleItems.weekday), asc(scheduleItems.time)] });
}

export async function scheduleForDay(db: DB, studentId: string, date: string) {
  const items = D.byTime(await db.query.scheduleItems.findMany({ where: and(eq(scheduleItems.studentId, studentId), eq(scheduleItems.weekday, D.weekday(date))) }));
  const done = items.length ? await db.query.scheduleDone.findMany({ where: and(inArray(scheduleDone.itemId, items.map((i) => i.id)), eq(scheduleDone.date, date)) }) : [];
  const doneIds = new Set(done.map((d) => d.itemId));
  return { items, doneIds, progress: D.scheduleProgress(items, doneIds) };
}

export async function saveScheduleItem(
  db: DB,
  actor: Actor,
  input: { studentId: string; itemId?: string; weekdays: number[]; time: string; title: string; icon: string },
) {
  await assertCan(db, actor, "MANAGE_SCHEDULE", input.studentId);
  const title = input.title.trim();
  if (!title || title.length > 60) throw err("err.schedTitle");
  if (!D.TIME_RE.test(input.time)) throw err("err.schedTime");
  if (!(SCHEDULE_ICONS as readonly string[]).includes(input.icon)) throw err("err.schedIcon");
  const days = [...new Set(input.weekdays)].filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  if (!days.length) throw err("err.schedDays");
  const icon = input.icon as ScheduleIcon;
  if (input.itemId) {
    db.update(scheduleItems)
      .set({ weekday: days[0], time: input.time, title, icon })
      .where(and(eq(scheduleItems.id, input.itemId), eq(scheduleItems.studentId, input.studentId)))
      .run();
  } else {
    for (const weekday of days) db.insert(scheduleItems).values({ studentId: input.studentId, weekday, time: input.time, title, icon, authorId: actor.id }).run();
  }
  S.audit(db, actor, "schedule.save", input.studentId, { title });
}

export async function deleteScheduleItem(db: DB, actor: Actor, input: { studentId: string; itemId: string }) {
  await assertCan(db, actor, "MANAGE_SCHEDULE", input.studentId);
  db.delete(scheduleItems).where(and(eq(scheduleItems.id, input.itemId), eq(scheduleItems.studentId, input.studentId))).run();
  S.audit(db, actor, "schedule.delete", input.studentId, { itemId: input.itemId });
}

export async function setScheduleDone(db: DB, actor: Actor, input: { itemId: string; done: boolean }) {
  const item = await db.query.scheduleItems.findFirst({ where: eq(scheduleItems.id, input.itemId) });
  if (!item) throw err("err.schedNotFound");
  await assertCan(db, actor, "DO_SCHEDULE", item.studentId);
  const date = S.today();
  if (D.weekday(date) !== item.weekday) throw err("err.schedToday");
  if (input.done) db.insert(scheduleDone).values({ itemId: item.id, date }).onConflictDoNothing().run();
  else db.delete(scheduleDone).where(and(eq(scheduleDone.itemId, item.id), eq(scheduleDone.date, date))).run();
}

/* =========================== mood =========================== */

export async function logMood(db: DB, actor: Actor, input: { studentId: string; slot: MoodSlot; mood: number }) {
  await assertCan(db, actor, "LOG_MOOD", input.studentId);
  if (!D.isMood(input.mood)) throw err("err.mood");
  const date = S.today();
  db.insert(moodChecks)
    .values({ studentId: input.studentId, date, slot: input.slot, mood: input.mood })
    .onConflictDoUpdate({ target: [moodChecks.studentId, moodChecks.date, moodChecks.slot], set: { mood: input.mood } })
    .run();
  S.audit(db, actor, "mood.log", input.studentId, { slot: input.slot, mood: input.mood });
}

export async function moodsOf(db: DB, studentId: string, from: string) {
  return db.query.moodChecks.findMany({ where: and(eq(moodChecks.studentId, studentId), gte(moodChecks.date, from)), orderBy: asc(moodChecks.date) });
}

/* =========================== pet =========================== */

export async function lifetimeStars(db: DB, studentId: string): Promise<number> {
  const [{ yes }] = await db.select({ yes: sql<number>`count(*)` }).from(marks).where(and(eq(marks.studentId, studentId), eq(marks.value, "YES")));
  const [{ sc }] = await db.select({ sc: sql<number>`count(*)` }).from(selfChecks).where(and(eq(selfChecks.studentId, studentId), eq(selfChecks.starAwarded, true)));
  return yes + sc;
}

export async function petOf(db: DB, studentId: string) {
  const pet = await db.query.pets.findFirst({ where: eq(pets.studentId, studentId) });
  const lifetime = await lifetimeStars(db, studentId);
  return { pet: pet ?? null, lifetime, ...D.petStage(lifetime) };
}

export async function choosePet(db: DB, actor: Actor, input: { studentId: string; kind: string; name: string }) {
  await assertCan(db, actor, "CHOOSE_PET", input.studentId);
  const name = input.name.trim();
  if (!name || name.length > 20) throw err("err.petName");
  if (!(PET_KINDS as readonly string[]).includes(input.kind)) throw err("err.petKind");
  const kind = input.kind as PetKind;
  db.insert(pets).values({ studentId: input.studentId, kind, name }).onConflictDoUpdate({ target: pets.studentId, set: { kind, name } }).run();
  S.audit(db, actor, "pet.choose", input.studentId, { kind });
}

/* =========================== observation scales =========================== */

export async function submitScale(db: DB, actor: Actor, input: { studentId: string; answers: number[] }) {
  await assertCan(db, actor, "FILL_SCALE", input.studentId);
  if (!D.validScaleAnswers(input.answers)) throw err("err.scaleAnswers");
  const date = S.today();
  const role = actor.role === "TEACHER" ? "TEACHER" : "PARENT";
  db.transaction((tx) => {
    // One form per person and day: filling it in again replaces the earlier one.
    tx.delete(scaleResponses).where(and(eq(scaleResponses.studentId, input.studentId), eq(scaleResponses.respondentId, actor.id), eq(scaleResponses.date, date))).run();
    tx.insert(scaleResponses).values({ studentId: input.studentId, respondentId: actor.id, respondentRole: role, date, answers: input.answers }).run();
  });
  const { student } = await S.getStudent(db, input.studentId);
  const psychs = (await adultsOf(db, input.studentId, actor.id)).filter((a) => a.role === "PSYCHOLOGIST");
  notify(db, psychs.map((p) => p.id), "ntf.scale", { child: student.displayName }, input.studentId, `/psych/student/${input.studentId}`);
  S.audit(db, actor, "scale.submit", input.studentId);
}

/** Psychologists see every form; teachers and parents only their own. */
export async function scalesOf(db: DB, actor: Actor, studentId: string) {
  const all = await can(db, actor, "VIEW_SCALES", studentId);
  if (!all) await assertCan(db, actor, "FILL_SCALE", studentId);
  const rows = await db
    .select({ r: scaleResponses, name: users.name })
    .from(scaleResponses)
    .innerJoin(users, eq(users.id, scaleResponses.respondentId))
    .where(all ? eq(scaleResponses.studentId, studentId) : and(eq(scaleResponses.studentId, studentId), eq(scaleResponses.respondentId, actor.id)))
    .orderBy(desc(scaleResponses.date), desc(scaleResponses.createdAt));
  return rows.map((x) => ({ ...x.r, respondentName: x.name, score: D.scoreScale(x.r.answers) }));
}

/* =========================== weekly class review =========================== */

export async function classWeek(db: DB, actor: Actor, monday: string) {
  if (actor.role !== "TEACHER") throw new S.UserError([{ key: "access.denied" }]);
  const kids = await S.studentsForActor(db, actor);
  const library = await S.allTechniques(db);
  const days = D.schoolDaysOfWeek(monday);
  const rows = [];
  for (const k of kids) {
    if (!(await can(db, actor, "VIEW", k.id))) continue;
    const consent = await can(db, actor, "MARK", k.id);
    if (!consent) {
      rows.push({ ...k, consent: false as const });
      continue;
    }
    const plan = await S.planFor(db, k.id, days[4]);
    const week = await S.weekSummary(db, k.id, monday);
    const weekMarks = await S.marksBetween(db, k.id, days[0], days[4]);
    const goalIds = plan?.goals.filter((g) => g.place === "SCHOOL").map((g) => g.id) ?? [];
    const perDay = days.map((d) => D.tallyByGoal(weekMarks.filter((m) => m.date === d), goalIds));
    const struggling = plan ? D.strugglingGoals(perDay, goalIds, plan.thresholdPct) : [];
    const hints = struggling.length ? D.suggestTechniques(library, new Set(plan!.techniques.map((t) => t.id))) : [];
    rows.push({
      ...k,
      consent: true as const,
      plan,
      week,
      successDays: week.filter((d) => d.success).length,
      ratedDays: week.filter((d) => d.tally.ratio !== null).length,
      struggling: struggling.map((s) => ({ ...s, goal: plan!.goals.find((g) => g.id === s.goalId)! })),
      hints,
    });
  }
  return rows;
}

/* =========================== printable report =========================== */

export async function reportData(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "VIEW_REPORT", studentId);
  const today = S.today();
  const [{ student, cls, school }, plans, series, checks, moods] = await Promise.all([
    S.getStudent(db, studentId),
    S.plansOf(db, studentId),
    S.goalSeries(db, studentId, 8),
    S.selfChecksOf(db, studentId, D.addDays(today, -28)),
    moodsOf(db, studentId, D.addDays(today, -28)),
  ]);
  const current = D.planForDate(plans, today);
  const monday = D.mondayOf(today);
  const weeks = await Promise.all(
    Array.from({ length: 4 }, (_, i) => D.addDays(monday, -7 * (3 - i))).map(async (m) => {
      const days = await S.weekSummary(db, studentId, m);
      return { monday: m, rated: days.filter((d) => d.tally.ratio !== null).length, success: days.filter((d) => d.success).length };
    }),
  );
  const notes = await db
    .select({ text: dayNotes.text, date: dayNotes.date, author: users.name, role: users.role })
    .from(dayNotes)
    .innerJoin(users, eq(users.id, dayNotes.authorId))
    .where(and(eq(dayNotes.studentId, studentId), gte(dayNotes.date, D.addDays(today, -28)), ne(dayNotes.text, "")))
    .orderBy(desc(dayNotes.date))
    .limit(12);
  const scales = actor.role === "PSYCHOLOGIST" ? await scalesOf(db, actor, studentId) : [];
  S.audit(db, actor, "report.view", studentId);
  return {
    student,
    cls,
    school,
    current,
    series,
    weeks,
    selfChecks: { n: checks.length, on: checks.filter((c) => c.onTask).length },
    moodAverage: D.moodAverage(moods.map((m) => m.mood)),
    moodCount: moods.length,
    notes,
    scales,
    techniques: current?.techniques ?? [],
    generatedOn: today,
  };
}
