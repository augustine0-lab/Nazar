import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { seed, DEMO_PASSWORD } from "@/db/seed";
import { can, type Actor } from "@/lib/access";
import { authenticate, MAX_FAILED_LOGINS } from "@/lib/authenticate";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";

let db: DB;
const actorByLogin = (login: string): Actor => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return { id: u.id, role: u.role, schoolId: u.schoolId };
};
const studentByLogin = (login: string) => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return db.select().from(s.students).where(eq(s.students.userId, u.id)).get()!.id;
};

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db, S.today());
});

describe("access", () => {
  it("lets each adult see only the children they are connected to", async () => {
    const misha = studentByLogin("misha");
    const anya = studentByLogin("anya");
    expect(await can(db, actorByLogin("olga"), "VIEW", misha)).toBe(true);
    expect(await can(db, actorByLogin("ivan"), "VIEW", misha)).toBe(false);
    expect(await can(db, actorByLogin("elena"), "VIEW", misha)).toBe(true);
    expect(await can(db, actorByLogin("elena"), "VIEW", anya)).toBe(false);
    expect(await can(db, actorByLogin("natalia"), "EDIT_PLAN", anya)).toBe(true);
    expect(await can(db, actorByLogin("misha"), "VIEW", anya)).toBe(false);
  });

  it("never shows observations to the school administrator", async () => {
    expect(await can(db, actorByLogin("admin"), "VIEW", studentByLogin("misha"))).toBe(false);
  });

  it("blocks marking without parental consent", async () => {
    const sasha = studentByLogin("sasha");
    expect(await can(db, actorByLogin("ivan"), "VIEW", sasha)).toBe(true);
    expect(await can(db, actorByLogin("ivan"), "MARK", sasha)).toBe(false);
  });
});

describe("marks and stars", () => {
  it("adds a star for YES and removes it when the mark is cleared", async () => {
    const misha = studentByLogin("misha");
    const olga = actorByLogin("olga");
    const day = S.workDay();
    const plan = (await S.planFor(db, misha, day))!;
    const goal = plan.goals.find((g) => g.place === "SCHOOL")!;
    const before = (await S.stars(db, misha, day)).balance;

    await S.setMark(db, olga, { studentId: misha, goalId: goal.id, date: day, lessonNo: 5, value: "YES" });
    expect((await S.stars(db, misha, day)).balance).toBe(before + 1);
    await S.setMark(db, olga, { studentId: misha, goalId: goal.id, date: day, lessonNo: 5, value: "NO" });
    expect((await S.stars(db, misha, day)).balance).toBe(before);
    await S.setMark(db, olga, { studentId: misha, goalId: goal.id, date: day, lessonNo: 5, value: null });
    expect((await S.marksBetween(db, misha, day, day)).filter((m) => m.lessonNo === 5)).toHaveLength(0);
  });

  it("refuses marks from another class's teacher and for old days", async () => {
    const misha = studentByLogin("misha");
    const day = S.workDay();
    const goal = (await S.planFor(db, misha, day))!.goals[0];
    await expect(S.setMark(db, actorByLogin("ivan"), { studentId: misha, goalId: goal.id, date: day, lessonNo: 3, value: "YES" })).rejects.toThrow();
    const old = D.addDays(D.mondayOf(day), -7);
    await expect(S.setMark(db, actorByLogin("olga"), { studentId: misha, goalId: goal.id, date: old, lessonNo: 3, value: "YES" })).rejects.toThrow(S.UserError);
  });

  it("lets only the parent mark home goals", async () => {
    const misha = studentByLogin("misha");
    const day = S.workDay();
    const home = (await S.planFor(db, misha, day))!.goals.find((g) => g.place === "HOME")!;
    await expect(S.setMark(db, actorByLogin("olga"), { studentId: misha, goalId: home.id, date: day, lessonNo: 0, value: "YES" })).rejects.toThrow();
    await S.setMark(db, actorByLogin("elena"), { studentId: misha, goalId: home.id, date: day, lessonNo: 0, value: "YES" });
  });

  it("caps self-check stars at three a day", async () => {
    const misha = studentByLogin("misha");
    const me = actorByLogin("misha");
    const awarded = [];
    for (let i = 0; i < 5; i++) awarded.push((await S.recordSelfCheck(db, me, { studentId: misha, homeworkId: null, onTask: true })).starAwarded);
    expect(awarded).toEqual([true, true, true, false, false]);
  });
});

describe("rewards", () => {
  it("grants a request and spends stars, refuses when there are not enough", async () => {
    const misha = studentByLogin("misha");
    const elena = actorByLogin("elena");
    const { balance } = await S.stars(db, misha);
    const list = await S.rewardsOf(db, misha);
    const cheap = list.find((r) => r.cost <= balance)!;
    await S.grantReward(db, elena, { studentId: misha, rewardId: cheap.id });
    expect((await S.stars(db, misha)).balance).toBe(balance - cheap.cost);
    const pricey = list.find((r) => r.cost > balance - cheap.cost)!;
    await expect(S.grantReward(db, elena, { studentId: misha, rewardId: pricey.id })).rejects.toThrow(S.UserError);
  });

  it("does not let a child request the same reward twice", async () => {
    const misha = studentByLogin("misha");
    const me = actorByLogin("misha");
    const game = (await S.rewardsOf(db, misha)).find((r) => r.title.startsWith("15 минут"))!;
    await expect(S.requestReward(db, me, { studentId: misha, rewardId: game.id })).rejects.toThrow(/уже попросил/);
  });
});

describe("support plan", () => {
  it("starts an approved change on the next school day and keeps today's plan", async () => {
    const anya = studentByLogin("anya");
    const pending = (await S.plansOf(db, anya)).find((p) => p.status === "PENDING")!;
    const from = await S.approvePlan(db, actorByLogin("timur"), { studentId: anya, planId: pending.id });
    expect(from).toBe(D.nextSchoolDay(S.today()));
    expect((await S.planFor(db, anya, S.today()))!.version).toBe(1);
    expect((await S.planFor(db, anya, from))!.version).toBe(2);
  });

  it("keeps goal history continuous across versions", async () => {
    const anya = studentByLogin("anya");
    const series = await S.goalSeries(db, anya, 4);
    expect(series.goals).toHaveLength(2);
    expect(series.weeks[1].ratios[0]).not.toBeNull();
  });

  it("rejects an invalid plan", async () => {
    const misha = studentByLogin("misha");
    await expect(
      S.submitPlan(db, actorByLogin("natalia"), { studentId: misha, goals: [], goalLineage: [], thresholdPct: 70, workMinutes: 10, breakMinutes: 3, techniqueIds: [] }),
    ).rejects.toThrow(S.UserError);
  });
});

describe("consent and data deletion", () => {
  it("stops marking after revocation and deletes observations after 30 days", async () => {
    const misha = studentByLogin("misha");
    await S.revokeConsent(db, actorByLogin("elena"), misha);
    expect(await can(db, actorByLogin("olga"), "MARK", misha)).toBe(false);
    expect(await S.purgeRevokedData(db, new Date())).toEqual([]);
    const later = new Date(Date.now() + 31 * 86_400_000);
    expect(await S.purgeRevokedData(db, later)).toEqual([misha]);
    expect(await S.marksBetween(db, misha, "2000-01-01", "2100-01-01")).toHaveLength(0);
  });
});

describe("login", () => {
  it("locks the account after five wrong passwords", async () => {
    for (let i = 0; i < MAX_FAILED_LOGINS - 1; i++) expect((await authenticate(db, "olga", "wrong")).ok).toBe(false);
    const locked = await authenticate(db, "olga", "wrong");
    expect(locked).toMatchObject({ ok: false, reason: "LOCKED" });
    expect(await authenticate(db, "olga", DEMO_PASSWORD)).toMatchObject({ ok: false, reason: "LOCKED" });
    const after = new Date(Date.now() + 16 * 60_000);
    expect((await authenticate(db, "olga", DEMO_PASSWORD, after)).ok).toBe(true);
  });

  it("accepts a child's PIN", async () => {
    expect((await authenticate(db, "Misha", "123456")).ok).toBe(true);
  });
});
