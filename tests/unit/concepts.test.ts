import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { AccessDenied, can, type Actor } from "@/lib/access";
import * as S from "@/lib/services";
import * as C from "@/lib/concept-services";
import * as D from "@/lib/domain";

let db: DB;
const actor = (login: string): Actor => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return { id: u.id, role: u.role, schoolId: u.schoolId };
};
const studentId = (login: string) => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return db.select().from(s.students).where(eq(s.students.userId, u.id)).get()!.id;
};
const ntfs = (login: string, kind: string) => db.select().from(s.notifications).where(eq(s.notifications.userId, actor(login).id)).all().filter((n) => n.kind === kind);
const technique = (key: string) => db.select().from(s.techniques).all().find((t) => t.title === `@demo.tech.${key}.title`)!;

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db, S.today());
});

describe("trial rules", () => {
  it("counts school days forward and back, skipping weekends", () => {
    expect(D.nthSchoolDay("2026-10-23", 1)).toBe("2026-10-23"); // Friday
    expect(D.nthSchoolDay("2026-10-24", 1)).toBe("2026-10-26"); // Saturday → Monday
    expect(D.nthSchoolDay("2026-10-19", 10)).toBe("2026-10-30");
    expect(D.schoolDaysBefore("2026-10-26", 3)).toEqual(["2026-10-21", "2026-10-22", "2026-10-23"]);
    expect(D.schoolDaysBetween("2026-10-23", "2026-10-27")).toEqual(["2026-10-23", "2026-10-26", "2026-10-27"]);
  });

  it("needs enough marked days in both phases", () => {
    expect(D.trialResult([0.5, 0.5, 0.5], [0.9, 0.9, 0.9, 0.9, 0.9]).verdict).toBe("NOT_ENOUGH");
    expect(D.trialResult([0.5, null, 0.5, 0.5, 0.5], [0.9, 0.9, null, 0.9]).verdict).toBe("NOT_ENOUGH");
  });

  it("calls a clear and consistent rise better, a clear fall worse, and the rest no change", () => {
    const better = D.trialResult([0.4, 0.5, 0.45, 0.5, 0.6], [0.7, 0.8, 0.65, 0.75, 0.4]);
    expect(better.before.median).toBe(0.5);
    expect(better.pem).toBeCloseTo(0.8);
    expect(better.verdict).toBe("BETTER");
    expect(D.trialResult([0.6, 0.7, 0.6, 0.7], [0.4, 0.5, 0.4, 0.5]).verdict).toBe("WORSE");
    expect(D.trialResult([0.5, 0.6, 0.5, 0.6], [0.55, 0.6, 0.55, 0.6]).verdict).toBe("NO_CHANGE");
  });

  it("a higher average from one or two lucky days is only mixed", () => {
    expect(D.trialResult([0.4, 0.4, 0.4, 0.4], [1, 1, 0.3, 0.3, 0.3]).verdict).toBe("MIXED");
  });
});

describe("trials", () => {
  it("only the psychologist starts a trial; teacher and parent see it and are told", async () => {
    const miras = studentId("miras");
    const input = { studentId: miras, techniqueId: technique("move").id, lineageId: null, days: 10, howTo: "Разминка каждые 15 минут" };
    await expect(C.startTrial(db, actor("aigul"), input)).rejects.toBeInstanceOf(AccessDenied);
    await expect(C.startTrial(db, actor("gulnar"), input)).rejects.toBeInstanceOf(AccessDenied);
    await C.startTrial(db, actor("saule"), input);
    const running = (await C.trialsOf(db, actor("aigul"), miras)).find((x) => x.trial.status === "RUNNING")!;
    expect(running.trial.startDate).toBe(D.firstSchoolDay(S.today()));
    expect(running.schoolDays).toBe(10);
    expect(running.before).toHaveLength(D.BASELINE_DAYS);
    expect(ntfs("aigul", "ntf.trialStart")).toHaveLength(1);
    expect(ntfs("gulnar", "ntf.trialStart")[0].href).toBe(`/parent?child=${miras}`);
    await expect(C.trialsOf(db, actor("miras"), miras)).rejects.toBeInstanceOf(AccessDenied);
  });

  it("allows one change at a time", async () => {
    const aliya = studentId("aliya");
    await expect(C.startTrial(db, actor("saule"), { studentId: aliya, techniqueId: technique("seat").id, lineageId: null, days: 5, howTo: "" })).rejects.toThrow(/проверка другого приёма/);
  });

  it("rejects a goal that is not in the child's plan and an unknown length", async () => {
    const miras = studentId("miras");
    const base = { studentId: miras, techniqueId: technique("move").id, howTo: "" };
    await expect(C.startTrial(db, actor("saule"), { ...base, lineageId: "nope", days: 10 })).rejects.toThrow();
    await expect(C.startTrial(db, actor("saule"), { ...base, lineageId: null, days: 7 })).rejects.toThrow();
  });

  it("extends and finishes a trial, and the decision reaches the team", async () => {
    const aliya = studentId("aliya");
    const [v] = await C.trialsOf(db, actor("saule"), aliya);
    await C.extendTrial(db, actor("saule"), { studentId: aliya, trialId: v.trial.id });
    const extended = (await C.trialsOf(db, actor("saule"), aliya))[0];
    expect(extended.schoolDays).toBe(10 + D.TRIAL_EXTEND_DAYS);
    await expect(C.finishTrial(db, actor("saule"), { studentId: aliya, trialId: v.trial.id, decision: "MAYBE", conclusion: "" })).rejects.toThrow();
    await C.finishTrial(db, actor("saule"), { studentId: aliya, trialId: v.trial.id, decision: "KEEP", conclusion: "Помогает" });
    expect(await C.runningTrial(db, aliya)).toBeUndefined();
    expect(ntfs("erlan", "ntf.trialKeep")).toHaveLength(1);
    expect(ntfs("aigul", "ntf.trialKeep")[0].href).toBe(`/teacher/student/${aliya}`);
  });

  it("the demo history compares the same goal before and during", async () => {
    const [done] = await C.trialsOf(db, actor("saule"), studentId("miras"));
    if (!done) return; // too early in the school year of the demo calendar
    expect(done.trial.decision).toBe("KEEP");
    expect(done.result.before.days).toBeGreaterThanOrEqual(D.MIN_PHASE_DAYS);
    expect(done.result.during.days).toBe(5);
  });
});

describe("passport and moving a pupil", () => {
  it("every adult in the team can read and fill the passport, the child and other teachers cannot", async () => {
    const miras = studentId("miras");
    for (const login of ["aigul", "gulnar", "saule"]) expect(await can(db, actor(login), "EDIT_PASSPORT", miras)).toBe(true);
    for (const login of ["nurlan", "miras", "admin", "erlan"]) expect(await can(db, actor(login), "VIEW_PASSPORT", miras)).toBe(false);
    const p = await C.passportOf(db, actor("aigul"), miras);
    expect(p.passport?.strengths).toBe("@demo.pp.strengths");
    expect(p.tried.map((x) => x.trial.decision)).toEqual(["KEEP"]);
  });

  it("validates and saves the passport", async () => {
    const aliya = studentId("aliya");
    const empty = { studentId: aliya, strengths: "", interests: "", helps: "", hard: "", calming: "", family: "" };
    await expect(C.savePassport(db, actor("erlan"), empty)).rejects.toThrow();
    await expect(C.savePassport(db, actor("erlan"), { ...empty, strengths: "x".repeat(D.PASSPORT_MAX + 1) })).rejects.toThrow();
    await C.savePassport(db, actor("erlan"), { ...empty, strengths: "  Хорошо рисует  " });
    const p = await C.passportOf(db, actor("saule"), aliya);
    expect(p.passport?.strengths).toBe("Хорошо рисует");
    expect(p.updatedBy?.role).toBe("PARENT");
  });

  it("a passport needs parental consent like any other observation", async () => {
    const sanzhar = studentId("sanzhar");
    expect(await can(db, actor("dana"), "EDIT_PASSPORT", sanzhar)).toBe(false);
  });

  it("moving a pupil hands access from the old teacher to the new one and points them to the passport", async () => {
    const miras = studentId("miras");
    const class4a = db.select().from(s.classGroups).all().find((c) => c.name === "4 «А»")!;
    await expect(C.moveStudent(db, actor("aigul"), { studentId: miras, classId: class4a.id })).rejects.toBeInstanceOf(AccessDenied);
    await C.moveStudent(db, actor("admin"), { studentId: miras, classId: class4a.id });
    expect(await can(db, actor("aigul"), "VIEW_PASSPORT", miras)).toBe(false);
    expect(await can(db, actor("nurlan"), "VIEW_PASSPORT", miras)).toBe(true);
    expect(ntfs("nurlan", "ntf.newStudent")[0].href).toBe(`/passport/${miras}`);
    expect(ntfs("gulnar", "ntf.moved")).toHaveLength(1);
    await expect(C.moveStudent(db, actor("admin"), { studentId: miras, classId: class4a.id })).rejects.toThrow();
  });
});

describe("class for everyone", () => {
  const class3b = () => db.select().from(s.classGroups).all().find((c) => c.name === "3 «Б»")!.id;

  it("only the class teacher manages class supports", async () => {
    await expect(C.classSupportsOf(db, actor("nurlan"), class3b())).rejects.toBeInstanceOf(AccessDenied);
    await expect(C.setClassSupport(db, actor("gulnar"), { classId: class3b(), support: "move", on: true })).rejects.toBeInstanceOf(AccessDenied);
    await expect(C.setClassSupport(db, actor("aigul"), { classId: class3b(), support: "nope", on: true })).rejects.toThrow();
    await C.setClassSupport(db, actor("aigul"), { classId: class3b(), support: "move", on: true });
    expect((await C.classSupportsOf(db, actor("aigul"), class3b())).has("move")).toBe(true);
    await C.setClassSupport(db, actor("aigul"), { classId: class3b(), support: "move", on: false });
    expect((await C.classSupportsOf(db, actor("aigul"), class3b())).has("move")).toBe(false);
  });

  it("shows plan techniques without names next to the class support that covers them", async () => {
    const { pupils, needs } = await C.classNeeds(db, actor("aigul"), class3b());
    expect(pupils).toBe(2);
    const card = needs.find((n) => n.technique.title === "@demo.tech.card.title")!;
    expect(card.n).toBe(2);
    expect(card.support).toBeNull();
    expect(needs.find((n) => n.technique.title === "@demo.tech.chunk.title")!.covered).toBe(true);
    const move = needs.find((n) => n.technique.title === "@demo.tech.move.title")!;
    expect(move.covered).toBe(false);
    await C.setClassSupport(db, actor("aigul"), { classId: class3b(), support: "move", on: true });
    expect((await C.classNeeds(db, actor("aigul"), class3b())).needs.find((n) => n.technique.id === move.technique.id)!.covered).toBe(true);
  });

  it("counts covered supports per principle", () => {
    expect(D.udlCoverage(["goal", "move", "timer"])).toEqual([
      { principle: "ENGAGE", on: 2, total: 4 },
      { principle: "REPRESENT", on: 1, total: 4 },
      { principle: "EXPRESS", on: 0, total: 4 },
    ]);
  });
});

describe("lesson board", () => {
  it("reads one step per line with optional picture and minutes", () => {
    expect(D.parseBoardSteps("👋 | Приветствие | 3\n\nЧитаем текст | 10\nРазминка")).toEqual([
      { icon: "👋", text: "Приветствие", minutes: 3 },
      { icon: D.DEFAULT_BOARD_ICON, text: "Читаем текст", minutes: 10 },
      { icon: D.DEFAULT_BOARD_ICON, text: "Разминка", minutes: D.DEFAULT_STEP_MINUTES },
    ]);
    const steps = D.parseBoardSteps("📖 | Читаем | 7");
    expect(D.parseBoardSteps(D.boardStepsToText(steps))).toEqual(steps);
  });

  it("saves the plan for the class teacher only and checks the limits", async () => {
    const class3b = db.select().from(s.classGroups).all().find((c) => c.name === "3 «Б»")!.id;
    await expect(C.saveBoard(db, actor("nurlan"), { classId: class3b, text: "Урок" })).rejects.toBeInstanceOf(AccessDenied);
    await expect(C.saveBoard(db, actor("aigul"), { classId: class3b, text: "Урок | 90" })).rejects.toThrow();
    await expect(C.saveBoard(db, actor("aigul"), { classId: class3b, text: "" })).rejects.toThrow();
    await C.saveBoard(db, actor("aigul"), { classId: class3b, text: "🔢 | Счёт | 5\n📖 | Чтение | 10" });
    expect(await C.boardOf(db, actor("aigul"), class3b)).toHaveLength(2);
  });
});
