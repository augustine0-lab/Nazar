import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import type { Actor } from "@/lib/access";
import * as S from "@/lib/services";
import * as X from "@/lib/flex-services";
import * as D from "@/lib/domain";

/* ---------- pure rules ---------- */

describe("start dice", () => {
  const hw = [
    { id: "a", subject: "Math", title: "p. 42", steps: [{ text: "open", doneAt: new Date() }, { text: "task 1", doneAt: null }] },
    { id: "b", subject: "Lang", title: "ex. 87", steps: [{ text: "read", doneAt: null }] },
    { id: "c", subject: "Art", title: "done", steps: [{ text: "x", doneAt: new Date() }] },
  ];

  it("offers each unfinished task with its first open step", () => {
    expect(D.startOptions(hw)).toEqual([
      { homeworkId: "a", subject: "Math", title: "p. 42", step: "task 1", stepNo: 2 },
      { homeworkId: "b", subject: "Lang", title: "ex. 87", step: "read", stepNo: 1 },
    ]);
  });

  it("never lands a reroll on the same task when there is another one", () => {
    const opts = D.startOptions(hw);
    for (const r of [0, 0.3, 0.99]) expect(D.rollStart(opts, r, "a")?.homeworkId).toBe("b");
    expect(D.rollStart(opts.slice(0, 1), 0.5, "a")?.homeworkId).toBe("a");
    expect(D.rollStart([], 0.5)).toBeNull();
  });
});

describe("own sound experiment", () => {
  it("alternates sound and quiet school days and ends after six", () => {
    const mon = "2026-11-09";
    expect(D.soundDay(mon, "2026-11-08")).toBe("NOT_STARTED");
    expect(D.soundDay(mon, mon)).toBe("SOUND");
    expect(D.soundDay(mon, "2026-11-10")).toBe("QUIET");
    expect(D.soundDay(mon, "2026-11-13")).toBe("SOUND");
    // A weekend day is the same kind of day as the Monday after it.
    expect(D.soundDay(mon, "2026-11-14")).toBe("QUIET");
    expect(D.soundDay(mon, "2026-11-16")).toBe("QUIET");
    expect(D.soundDay(mon, "2026-11-17")).toBe("DONE");
    expect(D.soundTrialEnd(mon)).toBe("2026-11-16");
    // Started on a Saturday: that day and the Monday after it are both days with sound.
    expect(D.soundDay("2026-11-14", "2026-11-14")).toBe("SOUND");
    expect(D.soundDay("2026-11-14", "2026-11-16")).toBe("SOUND");
    expect(D.soundDay("2026-11-14", "2026-11-17")).toBe("QUIET");
  });

  it("compares answers with sound and without, and needs enough of both", () => {
    const yes = (withNoise: boolean, n: number, on: number) => Array.from({ length: n }, (_, i) => ({ onTask: i < on, withNoise }));
    expect(D.soundResult([...yes(true, 3, 3), ...yes(false, 8, 1)]).verdict).toBe("NOT_ENOUGH");
    expect(D.soundResult([...yes(true, 8, 6), ...yes(false, 8, 3)]).verdict).toBe("HELPS");
    expect(D.soundResult([...yes(true, 8, 2), ...yes(false, 8, 6)]).verdict).toBe("HURTS");
    const same = D.soundResult([...yes(true, 5, 3), ...yes(false, 5, 3), { onTask: false, withNoise: null }]);
    expect(same).toMatchObject({ verdict: "SAME", sound: { checks: 5, onTask: 3 }, quiet: { checks: 5 } });
  });
});

describe("deals over homework", () => {
  it("allows one more offer after a no, and nothing while one is open or agreed", () => {
    expect(D.canOfferDeal([])).toBe(true);
    expect(D.canOfferDeal([{ status: "DECLINED" }])).toBe(true);
    expect(D.canOfferDeal([{ status: "DECLINED" }, { status: "DECLINED" }])).toBe(false);
    expect(D.canOfferDeal([{ status: "PROPOSED" }])).toBe(false);
    expect(D.canOfferDeal([{ status: "ACCEPTED" }])).toBe(false);
    expect(D.validCounter("VOICE", "DRAW")).toBe(true);
    expect(D.validCounter("VOICE", "VOICE")).toBe(false);
    expect(D.validCounter("VOICE", "OWN")).toBe(false);
  });
});

describe("homework ceiling", () => {
  it("reads the grade from the class name and takes the norm for it", () => {
    expect(D.gradeOf("3 «Б»")).toBe(3);
    expect(D.gradeOf("11А")).toBe(11);
    expect(D.gradeOf("Подготовишки")).toBeNull();
    expect(D.homeworkNorm("3 «Б»")).toBe(90);
    expect(D.homeworkNorm("1 «А»")).toBe(60);
  });

  it("knows the child's pace only after three timed tasks", () => {
    expect(D.paceOf([{ estMinutes: 20, actualMinutes: 40 }, { estMinutes: 10, actualMinutes: 30 }])).toBeNull();
    expect(D.paceOf([{ estMinutes: 20, actualMinutes: 40 }, { estMinutes: 10, actualMinutes: 30 }, { estMinutes: 30, actualMinutes: 50 }, { estMinutes: null, actualMinutes: 90 }])).toBe(2);
  });

  it("sums every task of an evening and flags it over the norm with the child's pace", () => {
    const hw = [
      { dueDate: "2026-11-17", estMinutes: 30 },
      { dueDate: "2026-11-17", estMinutes: 25 },
      { dueDate: "2026-11-17", estMinutes: null },
      { dueDate: "2026-11-18", estMinutes: 20 },
    ];
    const [tue, wed] = D.eveningLoad(hw, "2026-11-17", 90, 2);
    expect(tue).toMatchObject({ evening: "2026-11-16", tasks: 3, unknown: 1, estMinutes: 55, likelyMinutes: 110, over: true });
    expect(wed).toMatchObject({ estMinutes: 20, likelyMinutes: 40, over: false });
    // Without a known pace only the estimates count.
    expect(D.eveningLoad(hw, "2026-11-17", 90, null)[0]).toMatchObject({ likelyMinutes: null, over: false });
    // Homework due on Monday is done on Sunday evening.
    expect(D.eveningLoad([], "2026-11-16", 90, null)[0].evening).toBe("2026-11-15");
  });
});

describe("where I sit best", () => {
  const layout = { rows: 5, cols: 3, windowSide: "LEFT" as const };

  it("describes a place in the room", () => {
    expect(D.seatTraits(0, 1, layout)).toEqual(["front", "middle", "teacher"]);
    expect(D.seatTraits(4, 0, layout)).toEqual(["back", "window"]);
    expect(D.seatTraits(0, 2, layout)).toEqual(["front", "door"]);
    expect(D.seatTraits(2, 0, { ...layout, windowSide: "RIGHT" })).toEqual([]);
  });

  it("splits time by seats and compares the current one with the one before", () => {
    const mark = (date: string, value: "YES" | "NO") => ({ goalId: "g", value, date });
    const marks = [
      ...["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05"].flatMap((d) => [mark(d, "YES"), mark(d, "NO"), mark(d, "NO")]),
      ...["2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"].flatMap((d) => [mark(d, "YES"), mark(d, "YES"), mark(d, "NO")]),
    ];
    const periods = D.seatPeriods(
      [{ row: 0, col: 1, fromDate: "2026-11-09" }, { row: 4, col: 0, fromDate: "2026-11-02" }],
      marks,
      "2026-11-12",
    );
    expect(periods.map((p) => [p.from, p.to, p.days])).toEqual([["2026-11-02", "2026-11-08", 4], ["2026-11-09", "2026-11-12", 4]]);
    expect(D.seatVerdict(periods)).toBe("BETTER");
    expect(D.seatVerdict(periods.slice(0, 1))).toBe("NOT_ENOUGH");
    expect(D.seatVerdict([periods[0], { ...periods[1], days: 2 }])).toBe("NOT_ENOUGH");
  });
});

/* ---------- services on the demo school ---------- */

let db: DB;
const actorByLogin = (login: string): Actor => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return { id: u.id, role: u.role, schoolId: u.schoolId };
};
const studentByLogin = (login: string) => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return db.select().from(s.students).where(eq(s.students.userId, u.id)).get()!;
};
const mirasHomework = (authorLogin: string) =>
  db.select().from(s.homework).where(and(eq(s.homework.studentId, studentByLogin("miras").id), eq(s.homework.authorId, actorByLogin(authorLogin).id))).all();

describe("homework that fits the child, on the demo school", () => {
  beforeEach(() => {
    db = openDb(":memory:");
    migrate(db, { migrationsFolder: "./drizzle" });
    seed(db, S.today());
  });

  it("sends a deal to the author of the task and lets only that author answer", async () => {
    const miras = actorByLogin("miras");
    const langHw = mirasHomework("gulnar").find((h) => h.dueDate >= S.today())!;
    const dealId = await X.offerDeal(db, miras, { homeworkId: langHw.id, option: "VOICE" });
    // The teacher sees only deals on her own tasks; the demo already has one waiting for her.
    expect((await X.dealsToAnswer(db, actorByLogin("aigul"))).map((d) => d.deal.option)).toEqual(["HALF_HARDER"]);
    expect((await X.dealsToAnswer(db, actorByLogin("gulnar"))).map((d) => d.deal.id)).toEqual([dealId]);
    await expect(X.answerDeal(db, actorByLogin("aigul"), { dealId, answer: "ACCEPT" })).rejects.toThrow();
    await expect(X.answerDeal(db, actorByLogin("erlan"), { dealId, answer: "ACCEPT" })).rejects.toThrow();
    await X.answerDeal(db, actorByLogin("gulnar"), { dealId, answer: "COUNTER", counter: "SPLIT" });
    await expect(X.answerDeal(db, actorByLogin("gulnar"), { dealId, answer: "ACCEPT" })).rejects.toThrow();
    await X.replyToCounter(db, miras, { dealId, accept: true });
    const [deal] = await X.dealsFor(db, [langHw.id]);
    expect(deal).toMatchObject({ status: "ACCEPTED", option: "SPLIT" });
    // An agreed deal closes the task for new offers.
    await expect(X.offerDeal(db, miras, { homeworkId: langHw.id, option: "DRAW" })).rejects.toThrow();
  });

  it("moves the due date only for the 'a day later' deal", async () => {
    const miras = actorByLogin("miras");
    const langHw = mirasHomework("gulnar").find((h) => h.dueDate >= S.today())!;
    const dealId = await X.offerDeal(db, miras, { homeworkId: langHw.id, option: "LATER" });
    await X.answerDeal(db, actorByLogin("gulnar"), { dealId, answer: "ACCEPT" });
    const after = db.select().from(s.homework).where(eq(s.homework.id, langHw.id)).get()!;
    expect(after.dueDate).toBe(D.nextSchoolDay(langHw.dueDate));
  });

  it("refuses deals on a task the child wrote down and a third offer", async () => {
    const miras = actorByLogin("miras");
    const me = studentByLogin("miras");
    const own = await S.createHomework(db, miras, { studentId: me.id, subject: "Art", title: "draw", dueDate: D.nextSchoolDay(S.today()), steps: ["draw"] });
    await expect(X.offerDeal(db, miras, { homeworkId: own, option: "VOICE" })).rejects.toThrow();
    const langHw = mirasHomework("gulnar").find((h) => h.dueDate >= S.today())!;
    await expect(X.offerDeal(db, miras, { homeworkId: langHw.id, option: "OWN" })).rejects.toThrow();
    for (let i = 0; i < 2; i++) {
      const id = await X.offerDeal(db, miras, { homeworkId: langHw.id, option: "DRAW" });
      await X.answerDeal(db, actorByLogin("gulnar"), { dealId: id, answer: "DECLINE" });
    }
    await expect(X.offerDeal(db, miras, { homeworkId: langHw.id, option: "DRAW" })).rejects.toThrow();
    await expect(X.offerDeal(db, actorByLogin("aliya"), { homeworkId: langHw.id, option: "DRAW" })).rejects.toThrow();
  });

  it("shows tomorrow's evening over the norm once the child's real pace is known", async () => {
    const load = await X.loadOf(db, studentByLogin("miras").id);
    expect(load.norm).toBe(90);
    expect(load.pace).toBeCloseTo(2.1, 1);
    expect(load.evenings[0]).toMatchObject({ tasks: 3, estMinutes: 75, over: true });
    expect(load.evenings[0].likelyMinutes).toBeGreaterThan(150);
    expect(await X.overloadOf(db, studentByLogin("miras").id, load.evenings[0].dueDate)).not.toBeNull();
  });

  it("lets the child and a parent log the real time, not the teacher", async () => {
    const [hw] = mirasHomework("aigul");
    await X.setActualMinutes(db, actorByLogin("miras"), { homeworkId: hw.id, minutes: 45 });
    await X.setActualMinutes(db, actorByLogin("gulnar"), { homeworkId: hw.id, minutes: 50 });
    await expect(X.setActualMinutes(db, actorByLogin("aigul"), { homeworkId: hw.id, minutes: 10 })).rejects.toThrow();
    await expect(X.setActualMinutes(db, actorByLogin("gulnar"), { homeworkId: hw.id, minutes: 999 })).rejects.toThrow();
    expect(db.select().from(s.homework).where(eq(s.homework.id, hw.id)).get()!.actualMinutes).toBe(50);
  });

  it("checks the estimate when a task is added", async () => {
    const me = studentByLogin("miras");
    const base = { studentId: me.id, subject: "Math", title: "x", dueDate: D.nextSchoolDay(S.today()), steps: ["a"] };
    await expect(S.createHomework(db, actorByLogin("aigul"), { ...base, estMinutes: 2 })).rejects.toThrow();
    const id = await S.createHomework(db, actorByLogin("aigul"), { ...base, estMinutes: 15 });
    expect(db.select().from(s.homework).where(eq(s.homework.id, id)).get()!.estMinutes).toBe(15);
  });

  it("runs the sound experiment for the child and shows it to the adults around them", async () => {
    const me = studentByLogin("miras");
    const report = await X.soundReport(db, actorByLogin("gulnar"), me.id);
    expect(report).toMatchObject({ trial: { sound: "rain" }, sound: { checks: 8, onTask: 6 }, quiet: { checks: 8, onTask: 3 }, verdict: "HELPS" });
    await expect(X.soundReport(db, actorByLogin("erlan"), me.id)).rejects.toThrow();
    await expect(X.startSoundTrial(db, actorByLogin("gulnar"), { studentId: me.id, sound: "pink" })).rejects.toThrow();
    await X.startSoundTrial(db, actorByLogin("miras"), { studentId: me.id, sound: "pink" });
    expect((await X.soundTrialOf(db, me.id))?.sound).toBe("pink");
    await S.recordSelfCheck(db, actorByLogin("miras"), { studentId: me.id, homeworkId: null, onTask: true, withNoise: true });
    const after = await X.soundReport(db, actorByLogin("miras"), me.id);
    expect(after?.sound.checks).toBeGreaterThanOrEqual(1);
    await X.stopSoundTrial(db, actorByLogin("miras"), { studentId: me.id });
    expect(await X.soundReport(db, actorByLogin("miras"), me.id)).toBeNull();
  });

  it("lets only the class teacher seat the child, inside the plan", async () => {
    const me = studentByLogin("miras");
    const aigul = actorByLogin("aigul");
    const before = await X.seatReport(db, aigul, me.id);
    expect(before.periods).toHaveLength(2);
    expect(before.current).toMatchObject({ row: 0, col: 1 });
    expect(before.verdict).not.toBe("NOT_ENOUGH");
    await expect(X.moveSeat(db, aigul, { studentId: me.id, row: 9, col: 0 })).rejects.toThrow();
    await expect(X.moveSeat(db, actorByLogin("nurlan"), { studentId: me.id, row: 1, col: 1 })).rejects.toThrow();
    await expect(X.seatReport(db, actorByLogin("gulnar"), me.id)).rejects.toThrow();
    await X.moveSeat(db, aigul, { studentId: me.id, row: 2, col: 2 });
    await X.moveSeat(db, aigul, { studentId: me.id, row: 1, col: 2 });
    const after = await X.seatReport(db, aigul, me.id);
    expect(after.periods).toHaveLength(3);
    expect(after.current).toMatchObject({ row: 1, col: 2, from: S.today() });
    await X.saveLayout(db, aigul, { studentId: me.id, rows: 4, cols: 4, windowSide: "RIGHT" });
    expect(after.layout.rows).toBe(5);
    expect((await X.seatReport(db, aigul, me.id)).layout).toEqual({ rows: 4, cols: 4, windowSide: "RIGHT" });
    await expect(X.saveLayout(db, aigul, { studentId: me.id, rows: 40, cols: 4, windowSide: "LEFT" })).rejects.toThrow();
  });
});
