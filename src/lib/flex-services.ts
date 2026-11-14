// Homework that fits the child: deals over a task, real time against the estimate, the evening ceiling,
// the own-sound experiment and the seat in the classroom. Same rules as services.ts: every call checks access.
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import type { DB } from "@/db";
import { classLayouts, homework, homeworkDeals, marks, seatings, selfChecks, soundTrials, students, users } from "@/db/schema";
import { AccessDenied, assertCan, can, type Actor } from "./access";
import * as D from "./domain";
import { notify } from "./notify";
import * as S from "./services";
import type { MsgKey, Params } from "./i18n";

const userError = (key: MsgKey, params?: Params) => new S.UserError([{ key, params }]);

async function homeworkById(db: DB, homeworkId: string) {
  const hw = await db.query.homework.findFirst({ where: eq(homework.id, homeworkId) });
  if (!hw) throw userError("err.hwNotFound");
  return hw;
}

/* =========================== deals =========================== */

export type Deal = typeof homeworkDeals.$inferSelect;

export async function dealsFor(db: DB, homeworkIds: string[]): Promise<Deal[]> {
  if (!homeworkIds.length) return [];
  return db.query.homeworkDeals.findMany({ where: inArray(homeworkDeals.homeworkId, homeworkIds), orderBy: asc(homeworkDeals.createdAt) });
}

/** Deals waiting for this adult's answer: offers on tasks they set. */
export async function dealsToAnswer(db: DB, actor: Actor, studentId?: string) {
  const rows = await db
    .select({ deal: homeworkDeals, hw: homework, child: students.displayName })
    .from(homeworkDeals)
    .innerJoin(homework, eq(homework.id, homeworkDeals.homeworkId))
    .innerJoin(students, eq(students.id, homeworkDeals.studentId))
    .where(and(eq(homework.authorId, actor.id), eq(homeworkDeals.status, "PROPOSED"), studentId ? eq(homeworkDeals.studentId, studentId) : undefined))
    .orderBy(asc(homeworkDeals.createdAt));
  const out = [];
  for (const r of rows) if (await can(db, actor, "ANSWER_DEAL", r.deal.studentId)) out.push(r);
  return out;
}

/** The child offers the author a different way to do the task. */
export async function offerDeal(db: DB, actor: Actor, input: { homeworkId: string; option: string; note?: string }) {
  const hw = await homeworkById(db, input.homeworkId);
  await assertCan(db, actor, "OFFER_DEAL", hw.studentId);
  if (!D.isDealOption(input.option)) throw userError("err.dealOption");
  const note = (input.note ?? "").trim();
  if (note.length > D.DEAL_NOTE_MAX) throw userError("err.dealNote", { max: D.DEAL_NOTE_MAX });
  if (input.option === "OWN" && !note) throw userError("err.dealOwnNote");
  // A task the child wrote down themselves has nobody to bargain with.
  const author = await db.query.users.findFirst({ where: eq(users.id, hw.authorId) });
  if (!author || (author.role !== "TEACHER" && author.role !== "PARENT")) throw userError("err.dealSelf");
  const existing = await dealsFor(db, [hw.id]);
  if (!D.canOfferDeal(existing)) throw userError("err.dealLimit");
  const id = crypto.randomUUID();
  db.insert(homeworkDeals).values({ id, homeworkId: hw.id, studentId: hw.studentId, option: input.option, note, status: "PROPOSED" }).run();
  const { student } = await S.getStudent(db, hw.studentId);
  const href = author.role === "TEACHER" ? `/teacher/student/${hw.studentId}#deals` : `/parent/homework?child=${hw.studentId}#deals`;
  notify(db, [author.id], "ntf.deal", { child: student.displayName, task: hw.title }, hw.studentId, href);
  S.audit(db, actor, "deal.offer", hw.studentId, { dealId: id, option: input.option });
  return id;
}

/** The author of the task accepts, declines or offers another of the ready deals. */
export async function answerDeal(db: DB, actor: Actor, input: { dealId: string; answer: "ACCEPT" | "DECLINE" | "COUNTER"; counter?: string }) {
  const deal = await db.query.homeworkDeals.findFirst({ where: eq(homeworkDeals.id, input.dealId) });
  if (!deal) throw userError("err.dealNotFound");
  const hw = await homeworkById(db, deal.homeworkId);
  await assertCan(db, actor, "ANSWER_DEAL", hw.studentId);
  if (hw.authorId !== actor.id) throw new AccessDenied();
  if (deal.status !== "PROPOSED") throw userError("err.dealDone");
  const decided = { decidedById: actor.id, decidedAt: new Date() };
  if (input.answer === "COUNTER") {
    if (!D.validCounter(deal.option, input.counter)) throw userError("err.dealCounter");
    db.update(homeworkDeals).set({ status: "COUNTERED", counterOption: input.counter, ...decided }).where(eq(homeworkDeals.id, deal.id)).run();
  } else if (input.answer === "ACCEPT") {
    db.update(homeworkDeals).set({ status: "ACCEPTED", ...decided }).where(eq(homeworkDeals.id, deal.id)).run();
    applyDeal(db, hw, deal.option);
  } else {
    db.update(homeworkDeals).set({ status: "DECLINED", ...decided }).where(eq(homeworkDeals.id, deal.id)).run();
  }
  S.audit(db, actor, `deal.${input.answer.toLowerCase()}`, hw.studentId, { dealId: deal.id, counter: input.counter ?? null });
}

/** The child takes or turns down the adult's counter-offer. */
export async function replyToCounter(db: DB, actor: Actor, input: { dealId: string; accept: boolean }) {
  const deal = await db.query.homeworkDeals.findFirst({ where: eq(homeworkDeals.id, input.dealId) });
  if (!deal) throw userError("err.dealNotFound");
  const hw = await homeworkById(db, deal.homeworkId);
  await assertCan(db, actor, "OFFER_DEAL", hw.studentId);
  if (deal.status !== "COUNTERED" || !deal.counterOption) throw userError("err.dealDone");
  if (input.accept) {
    db.update(homeworkDeals).set({ status: "ACCEPTED", option: deal.counterOption }).where(eq(homeworkDeals.id, deal.id)).run();
    applyDeal(db, hw, deal.counterOption);
  } else {
    db.update(homeworkDeals).set({ status: "DECLINED" }).where(eq(homeworkDeals.id, deal.id)).run();
  }
  notify(db, [hw.authorId], input.accept ? "ntf.dealTaken" : "ntf.dealRefused", { task: hw.title }, hw.studentId, null);
  S.audit(db, actor, input.accept ? "deal.counterAccepted" : "deal.counterDeclined", hw.studentId, { dealId: deal.id });
}

/** "A day later" is the only deal that changes the task itself: the due date moves to the next school day. */
function applyDeal(db: DB, hw: typeof homework.$inferSelect, option: D.DealOption) {
  if (option === "LATER") db.update(homework).set({ dueDate: D.nextSchoolDay(hw.dueDate) }).where(eq(homework.id, hw.id)).run();
}

/* =========================== real time and the evening ceiling =========================== */

/** How long the task really took, from the child or a parent. Zero clears it. */
export async function setActualMinutes(db: DB, actor: Actor, input: { homeworkId: string; minutes: number }) {
  const hw = await homeworkById(db, input.homeworkId);
  await assertCan(db, actor, "LOG_HW_TIME", hw.studentId);
  if (!Number.isInteger(input.minutes) || input.minutes < 0 || input.minutes > D.ACTUAL_MAX) throw userError("err.hwActual", { max: D.ACTUAL_MAX });
  db.update(homework).set({ actualMinutes: input.minutes || null }).where(eq(homework.id, hw.id)).run();
}

export interface Load {
  norm: number | null;
  pace: number | null;
  evenings: D.Evening[];
}

/** The coming evenings of one child: every task from every adult, against the norm and the child's pace. */
export async function loadOf(db: DB, studentId: string, fromDue = D.nextSchoolDay(S.today())): Promise<Load> {
  const { cls } = await S.getStudent(db, studentId);
  const [ahead, past] = await Promise.all([
    db.query.homework.findMany({ where: and(eq(homework.studentId, studentId), gte(homework.dueDate, fromDue)) }),
    db.query.homework.findMany({ where: and(eq(homework.studentId, studentId), gte(homework.dueDate, D.addDays(S.today(), -28)), lte(homework.dueDate, S.today())) }),
  ]);
  const norm = D.homeworkNorm(cls.name);
  const pace = D.paceOf(past);
  return { norm, pace, evenings: D.eveningLoad(ahead, fromDue, norm, pace) };
}

/** The evening a new task lands on, when it goes over the norm. Used to warn the adult who just added it. */
export async function overloadOf(db: DB, studentId: string, dueDate: string) {
  const load = await loadOf(db, studentId, dueDate);
  const e = load.evenings[0];
  return e && e.dueDate === dueDate && e.over && load.norm !== null ? { evening: e, norm: load.norm } : null;
}

/* =========================== my sound =========================== */

export async function soundTrialOf(db: DB, studentId: string) {
  return (await db.query.soundTrials.findFirst({ where: eq(soundTrials.studentId, studentId) })) ?? null;
}

/** Starts (or restarts) the six-day experiment from today with the chosen sound. */
export async function startSoundTrial(db: DB, actor: Actor, input: { studentId: string; sound: string }) {
  await assertCan(db, actor, "RUN_SOUND", input.studentId);
  if (!D.isSound(input.sound)) throw userError("err.sound");
  // Started at the weekend, the first day counts together with the Monday after it.
  const startedOn = S.today();
  db.insert(soundTrials)
    .values({ studentId: input.studentId, sound: input.sound, startedOn })
    .onConflictDoUpdate({ target: soundTrials.studentId, set: { sound: input.sound, startedOn, createdAt: new Date() } })
    .run();
  S.audit(db, actor, "sound.start", input.studentId, { sound: input.sound });
}

export async function stopSoundTrial(db: DB, actor: Actor, input: { studentId: string }) {
  await assertCan(db, actor, "RUN_SOUND", input.studentId);
  db.delete(soundTrials).where(eq(soundTrials.studentId, input.studentId)).run();
}

/** The experiment, today's kind of day and the comparison so far. Visible to the child and the adults around them. */
export async function soundReport(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "VIEW", studentId);
  const trial = await soundTrialOf(db, studentId);
  if (!trial) return null;
  const end = D.soundTrialEnd(trial.startedOn);
  const checks = await db.query.selfChecks.findMany({
    where: and(eq(selfChecks.studentId, studentId), gte(selfChecks.date, trial.startedOn), lte(selfChecks.date, end)),
    orderBy: desc(selfChecks.createdAt),
  });
  return { trial, end, today: D.soundDay(trial.startedOn, S.today()), ...D.soundResult(checks) };
}

/* =========================== where I sit best =========================== */

export async function layoutOf(db: DB, classId: string) {
  const l = await db.query.classLayouts.findFirst({ where: eq(classLayouts.classId, classId) });
  return l ? { rows: l.rows, cols: l.cols, windowSide: l.windowSide } : { ...D.DEFAULT_LAYOUT };
}

export async function saveLayout(db: DB, actor: Actor, input: { studentId: string; rows: number; cols: number; windowSide: string }) {
  await assertCan(db, actor, "SEAT", input.studentId);
  const { cls } = await S.getStudent(db, input.studentId);
  if (!(D.LAYOUT_ROWS as readonly number[]).includes(input.rows) || !(D.LAYOUT_COLS as readonly number[]).includes(input.cols)) throw userError("err.layout");
  const windowSide = input.windowSide === "RIGHT" ? "RIGHT" : "LEFT";
  const v = { rows: input.rows, cols: input.cols, windowSide, updatedAt: new Date() } as const;
  db.insert(classLayouts).values({ classId: cls.id, ...v }).onConflictDoUpdate({ target: classLayouts.classId, set: v }).run();
}

/** Moves the child to a seat from today. Moving twice on one day just corrects the seat. */
export async function moveSeat(db: DB, actor: Actor, input: { studentId: string; row: number; col: number }) {
  await assertCan(db, actor, "SEAT", input.studentId);
  const { cls } = await S.getStudent(db, input.studentId);
  const layout = await layoutOf(db, cls.id);
  if (!Number.isInteger(input.row) || !Number.isInteger(input.col) || input.row < 0 || input.col < 0 || input.row >= layout.rows || input.col >= layout.cols)
    throw userError("err.seat");
  const fromDate = S.today();
  db.insert(seatings)
    .values({ studentId: input.studentId, row: input.row, col: input.col, fromDate, authorId: actor.id })
    .onConflictDoUpdate({ target: [seatings.studentId, seatings.fromDate], set: { row: input.row, col: input.col, authorId: actor.id } })
    .run();
  S.audit(db, actor, "seat.move", input.studentId, { row: input.row, col: input.col });
}

/** The plan of the room, the seats the child had and how the behaviour card looked on each. */
export async function seatReport(db: DB, actor: Actor, studentId: string) {
  await assertCan(db, actor, "SEAT", studentId);
  const { cls } = await S.getStudent(db, studentId);
  const [layout, seats] = await Promise.all([
    layoutOf(db, cls.id),
    db.query.seatings.findMany({ where: eq(seatings.studentId, studentId), orderBy: asc(seatings.fromDate) }),
  ]);
  const from = seats[0]?.fromDate ?? S.today();
  const rows = await db.query.marks.findMany({ where: and(eq(marks.studentId, studentId), gte(marks.date, from)) });
  const school = rows.filter((m) => m.lessonNo > 0).map((m) => ({ goalId: m.goalId, value: m.value, date: m.date }));
  const periods = D.seatPeriods(seats, school, S.today());
  return { layout, periods, verdict: D.seatVerdict(periods), current: periods.at(-1) ?? null };
}

