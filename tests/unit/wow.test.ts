import { beforeEach, describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { AccessDenied, type Actor } from "@/lib/access";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import * as W from "@/lib/wow-services";
import { notificationText } from "@/lib/notification-text";

/* ---------- pure rules ---------- */

describe("«Надуй шарик»: only long, even breaths fill the balloon", () => {
  const blow = (state: D.BreathState, level: number, ms: number) => {
    let st = state;
    const events: D.BreathEvent[] = [];
    for (let t = 0; t < ms; t += 50) {
      const r = D.breathStep(st, level, 50);
      st = r.state;
      if (r.event) events.push(r.event);
    }
    return { st, events };
  };

  it("counts a breath out of 2.5 s and more, and ignores a short puff", () => {
    let { st, events } = blow(D.BREATH_START, 0.5, 3000);
    ({ st, events } = blow(st, 0, 100));
    expect(st.breaths).toBe(1);
    expect(events).toEqual(["breath"]);

    ({ st, events } = blow(st, 0.5, 800));
    ({ st, events } = blow(st, 0, 100));
    expect(st.breaths).toBe(1);
    expect(events).toEqual(["short"]);
  });

  it("waits while the child blows too hard, and warns once", () => {
    const { st, events } = blow(D.BREATH_START, 0.95, 3000);
    expect(st.ms).toBe(0);
    expect(events.filter((e) => e === "strong")).toHaveLength(1);
    expect(D.balloonFill(st)).toBe(0);
  });

  it("is full after five breaths and then stays full", () => {
    let st = D.BREATH_START;
    const all: D.BreathEvent[] = [];
    for (let k = 0; k < 6; k++) {
      let r = blow(st, 0.5, 2600);
      r = blow(r.st, 0, 100);
      st = r.st;
      all.push(...r.events);
    }
    expect(st.breaths).toBe(D.BREATHS_GOAL);
    expect(all.at(-1)).toBe("done");
    expect(D.balloonFill(st)).toBe(1);
  });

  it("turns microphone loudness into blowing strength above the room's quiet", () => {
    expect(D.noiseFloor([0.01, 0.5, 0.012, 0.011, 0.009])).toBe(0.011);
    expect(D.blowLevel(0.015, 0.01)).toBe(0);
    expect(D.blowLevel(0.12, 0.01)).toBeCloseTo(0.525, 3);
    expect(D.blowLevel(1, 0.01)).toBe(1);
    expect(D.rms([0.5, -0.5, 0.5, -0.5])).toBe(0.5);
  });
});

describe("«Светофор тишины»: the tree grows in a working whisper and only waits in noise", () => {
  it("keeps growing through a short noise, then waits, never losing growth", () => {
    let st = D.QUIET_START;
    for (let k = 0; k < 10; k++) st = D.quietStep(st, 30, 55, 100);
    expect(st).toMatchObject({ quietMs: 1000, light: "green" });
    st = D.quietStep(st, 50, 55, 100);
    expect(st.light).toBe("yellow");
    for (let k = 0; k < 30; k++) st = D.quietStep(st, 80, 55, 100);
    expect(st.light).toBe("red");
    expect(st.quietMs).toBe(1100 + 1400);
    st = D.quietStep(st, 20, 55, 100);
    expect(st).toMatchObject({ loudMs: 0, light: "green", quietMs: 2600 });
  });

  it("grows in five stages to blossom at the goal", () => {
    expect(D.treeStage(0, 5)).toBe(0);
    expect(D.treeStage(60_000, 5)).toBe(1);
    expect(D.treeStage(5 * 60_000, 5)).toBe(D.TREE_STAGES);
    expect(D.treeStage(50 * 60_000, 5)).toBe(D.TREE_STAGES);
    expect(D.loudnessPct(0)).toBe(0);
    expect(D.loudnessPct(0.001)).toBe(0);
    expect(D.loudnessPct(1)).toBe(100);
  });
});

describe("«Чистый стол»: the desk is clear only when nothing distracting stays in sight", () => {
  it("needs a phone in three frames to count it, and two clear seconds after it is gone", () => {
    let st = D.deskStart(0);
    const phone = new Set(["cell phone"]);
    let r = D.deskStep(st, phone, 100);
    expect(r.onDesk).toEqual([]);
    r = D.deskStep(r.state, phone, 200);
    r = D.deskStep(r.state, phone, 300);
    expect(r.onDesk).toEqual(["cell phone"]);
    st = r.state;
    r = D.deskStep(st, new Set(), 1000);
    expect(r.onDesk).toEqual(["cell phone"]);
    r = D.deskStep(r.state, new Set(), 1400);
    expect(r.onDesk).toEqual([]);
    expect(r.clear).toBe(false);
    r = D.deskStep(r.state, new Set(), 3300);
    expect(r.clear).toBe(false);
    r = D.deskStep(r.state, new Set(), 3500);
    expect(r.clear).toBe(true);
  });

  it("does not stop for books and water, and looks at least two seconds", () => {
    let r = D.deskStep(D.deskStart(0), new Set(["book", "bottle"]), 500);
    expect(r.onDesk).toEqual([]);
    expect(r.clear).toBe(false);
    r = D.deskStep(r.state, new Set(["book"]), 2100);
    expect(r.clear).toBe(true);
  });
});

describe("«Инструкция, которая не улетает»", () => {
  it("cleans a spoken phrase into a point", () => {
    expect(D.cleanPhrase("  так, откройте   учебник на странице 42. ")).toBe("Откройте учебник на странице 42");
    expect(D.cleanPhrase("ал енді дәптерді ашыңдар")).toBe("Енді дәптерді ашыңдар");
    expect(D.cleanPhrase("...")).toBe("");
    expect(D.cleanPhrase("а".repeat(300)).length).toBeLessThanOrEqual(D.MAX_PIN_CHARS + 1);
  });

  it("keeps at most six points, without repeats", () => {
    let list: D.Pinned[] = [];
    list = D.pinInstruction(list, "откройте учебник");
    list = D.pinInstruction(list, "Откройте учебник.");
    list = D.pinInstruction(list, " ");
    expect(list).toEqual([{ text: "Откройте учебник", done: false }]);
    for (let k = 1; k <= 7; k++) list = D.pinInstruction(list, `шаг ${k}`);
    expect(list).toHaveLength(D.MAX_PINNED);
    expect(list[0].text).toBe("Шаг 2");
  });
});

describe("«Моя четверть в сторис»: rules", () => {
  it("knows the Kazakhstan school quarters, and falls back to four weeks early in a quarter", () => {
    expect(D.quarterOf("2026-09-15")).toEqual({ n: 1, from: "2026-09-01" });
    expect(D.quarterOf("2026-11-24")).toEqual({ n: 2, from: "2026-11-01" });
    expect(D.quarterOf("2027-02-10")).toEqual({ n: 3, from: "2027-01-01" });
    expect(D.quarterOf("2027-04-10")).toEqual({ n: 4, from: "2027-03-25" });
    expect(D.quarterOf("2027-07-01")).toEqual({ n: 4, from: "2027-03-25" });
    expect(D.recapPeriod("2026-11-24")).toEqual({ kind: "quarter", n: 2, from: "2026-11-01", to: "2026-11-24" });
    expect(D.recapPeriod("2026-11-05")).toEqual({ kind: "weeks", from: "2026-10-08", to: "2026-11-05" });
  });

  it("tells only what grew", () => {
    const slides = D.recapSlides({ stars: 12, steps: 0, onTask: 3, streak: 1, bestWeekday: 3, growth: null, pet: null, goodMoods: 0 });
    expect(slides.map((x) => x.kind)).toEqual(["hello", "stars", "weekday", "focus", "next"]);
    expect(D.longestStreak([{ ratio: 0.8 }, { ratio: null }, { ratio: 0.9 }, { ratio: 0.2 }, { ratio: 1 }], 70)).toBe(2);
    expect(D.topGrowth(["a", "b"], [{ ratios: [0.2, 0.5] }, { ratios: [0.6, 0.4] }, { ratios: [null, 0.3] }])).toEqual({ goal: "a", from: 0.2, to: 0.6 });
    expect(D.topGrowth(["a"], [{ ratios: [0.5] }, { ratios: [0.4] }])).toBeNull();
  });

  it("finds the best weekday only with enough marks behind it", () => {
    const marks = [
      ...Array.from({ length: 6 }, () => ({ date: "2026-11-23", value: "NO" })), // Monday
      ...Array.from({ length: 6 }, () => ({ date: "2026-11-25", value: "YES" })), // Wednesday
      { date: "2026-11-27", value: "YES" }, // Friday, one mark
    ];
    expect(D.bestWeekday(marks, D.weekday)).toBe(3);
  });
});

describe("«Карта трудных минут»: rules", () => {
  it("counts NO among rated marks per weekday and lesson, and narrows to chosen days", () => {
    const m = (date: string, lessonNo: number, value: string) => ({ date, lessonNo, value });
    const marks = [m("2026-11-23", 4, "NO"), m("2026-11-23", 4, "NO"), m("2026-11-23", 4, "YES"), m("2026-11-16", 4, "NO"), m("2026-11-16", 4, "NA"), m("2026-11-24", 1, "YES"), m("2026-11-23", 0, "NO")];
    const g = D.hardGrid(marks, D.weekday);
    expect(g.lessons).toBe(4);
    const mon4 = g.cells.find((c) => c.day === 1 && c.lesson === 4)!;
    expect(mon4).toEqual({ day: 1, lesson: 4, no: 3, rated: 4, dates: ["2026-11-16", "2026-11-23"] });
    expect(D.hardestCell(g.cells)).toBe(mon4);
    const narrowed = D.hardGrid(marks, D.weekday, (d) => d === "2026-11-23");
    expect(narrowed.cells.find((c) => c.day === 1 && c.lesson === 4)).toMatchObject({ no: 2, rated: 3 });
    expect(D.hardestCell(narrowed.cells)).toBeNull(); // three marks are too few
  });
});

/* ---------- services on the demo school ---------- */

let db: DB;
const actor = (login: string): Actor => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return { id: u.id, role: u.role, schoolId: u.schoolId };
};
const studentId = (login: string) => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return db.select().from(s.students).where(eq(s.students.userId, u.id)).get()!.id;
};

describe("services", () => {
  beforeEach(() => {
    db = openDb(":memory:");
    migrate(db, { migrationsFolder: "./drizzle" });
    seed(db, S.today());
  });

  it("builds the quarter stories for the child and the parent, and nobody else outside the team", async () => {
    const miras = studentId("miras");
    const r = await W.recapOf(db, actor("miras"), miras);
    const kinds = r.slides.map((x) => x.kind);
    expect(kinds[0]).toBe("hello");
    expect(kinds.at(-1)).toBe("next");
    expect(kinds).toContain("stars");
    expect(kinds).toContain("pet");
    expect(r.goals.length).toBeGreaterThan(0);
    expect((await W.recapOf(db, actor("gulnar"), miras)).slides).toEqual(r.slides);
    await expect(W.recapOf(db, actor("erlan"), miras)).rejects.toBeInstanceOf(AccessDenied);
    await expect(W.recapOf(db, actor("aliya"), miras)).rejects.toBeInstanceOf(AccessDenied);
  });

  it("lets only the child pick next quarter's goal, and tells the parent and the psychologist", async () => {
    const miras = studentId("miras");
    const { goals } = await W.recapOf(db, actor("miras"), miras);
    await expect(W.chooseRecapGoal(db, actor("gulnar"), { studentId: miras, goalId: goals[0].id })).rejects.toBeInstanceOf(AccessDenied);
    await expect(W.chooseRecapGoal(db, actor("miras"), { studentId: miras, goalId: crypto.randomUUID() })).rejects.toBeInstanceOf(AccessDenied);
    await W.chooseRecapGoal(db, actor("miras"), { studentId: miras, goalId: goals[0].id });
    const sent = db.select().from(s.notifications).where(eq(s.notifications.kind, "ntf.recapGoal")).all();
    const to = new Set(sent.map((n) => n.userId));
    expect(to).toEqual(new Set([actor("gulnar").id, actor("saule").id]));
    expect(notificationText("ru", sent[0])).toMatch(/выбрал цель на следующую четверть/);
  });

  it("shows the psychologist Miras's hard Monday lessons, with the sleep layer and the teacher's notes", async () => {
    const miras = studentId("miras");
    const map = await W.hardMapOf(db, actor("saule"), miras);
    expect(map.lessons).toBe(5);
    const hardest = D.hardestCell(map.layers.all)!;
    expect(hardest.day).toBe(1);
    expect(hardest.lesson).toBeGreaterThanOrEqual(4);
    expect(map.layers.sleep).not.toBeNull();
    expect(map.shortSleepDays).toBeGreaterThan(0);
    expect(Object.values(map.notes).flat()).toContain("@demo.note.monday");
    // The teacher has no sleep diary: the map comes without that layer.
    expect((await W.hardMapOf(db, actor("aigul"), miras)).layers.sleep).toBeNull();
    await expect(W.hardMapOf(db, actor("erlan"), miras)).rejects.toBeInstanceOf(AccessDenied);
  });

  it("keeps the demo notes on Mondays", () => {
    const miras = studentId("miras");
    const notes = db.select().from(s.dayNotes).where(and(eq(s.dayNotes.studentId, miras), eq(s.dayNotes.text, "@demo.note.monday"))).all();
    expect(notes).toHaveLength(1);
    expect(D.weekday(notes[0].date)).toBe(1);
  });
});
