import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { resetDemo, seed, wipe } from "@/db/seed";
import { AccessDenied, type Actor } from "@/lib/access";
import * as S from "@/lib/services";
import * as M from "@/lib/more-services";
import * as D from "@/lib/domain";
import { dictionary } from "@/lib/i18n";
import { flushOutbox } from "@/lib/mailer";
import { demoEnabled } from "@/lib/demo-mode";

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

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db, S.today());
});

describe("domain rules", () => {
  it("reads story steps with an optional picture before a bar", () => {
    expect(D.parseStorySteps("🙋 | Поднимаю руку\n\n  Жду  \n| нет картинки")).toEqual([
      { icon: "🙋", text: "Поднимаю руку" },
      { icon: D.DEFAULT_STEP_ICON, text: "Жду" },
      { icon: D.DEFAULT_STEP_ICON, text: "| нет картинки" },
    ]);
  });

  it("every library story has its title and steps in both languages", () => {
    const ru = dictionary("ru");
    const kk = dictionary("kk");
    for (const st of D.libraryStories()) {
      for (const text of [st.title, ...st.steps.map((x) => x.text)]) {
        const key = text.slice(1);
        expect(ru[key], key).toBeTruthy();
        expect(kk[key], key).toBeTruthy();
      }
    }
  });

  it("saving goal progress stops at 100% and counts quarter milestones", () => {
    expect(D.goalProgress(0, 20)).toEqual({ pct: 0, left: 20, milestone: 0 });
    expect(D.goalProgress(10, 20)).toEqual({ pct: 50, left: 10, milestone: 2 });
    expect(D.goalProgress(19, 20).milestone).toBe(3);
    expect(D.goalProgress(30, 20)).toEqual({ pct: 100, left: 0, milestone: 4 });
  });

  it("a trend needs both weeks and ignores small differences", () => {
    expect(D.trend(0.8, null)).toBeNull();
    expect(D.trend(0.72, 0.7)).toBe("SAME");
    expect(D.trend(0.8, 0.7)).toBe("UP");
    expect(D.trend(0.5, 0.7)).toBe("DOWN");
  });

  it("sleep is 0–16 hours in half hours and compared on both sides of nine hours", () => {
    expect(D.validSleep(9.5)).toBe(true);
    expect(D.validSleep(9.3)).toBe(false);
    expect(D.validSleep(17)).toBe(false);
    expect(D.validSleep(Number.NaN)).toBe(false);
    const r = D.sleepVsDay([
      { sleep: 8, ratio: 0.4 },
      { sleep: 8.5, ratio: 0.6 },
      { sleep: 10, ratio: 0.9 },
      { sleep: null, ratio: 1 },
      { sleep: 9, ratio: null },
    ]);
    expect(r.short).toEqual({ days: 2, avg: 0.5 });
    expect(r.enough).toEqual({ days: 1, avg: 0.9 });
  });

  it("checks e-mail addresses", () => {
    expect(D.isEmail("gulnar@example.kz")).toBe(true);
    expect(D.isEmail("gulnar@")).toBe(false);
    expect(D.isEmail("a b@c.kz")).toBe(false);
  });
});

describe("social stories", () => {
  it("parents and the psychologist write stories, the teacher cannot, the child reads them", async () => {
    const miras = studentId("miras");
    await M.saveStory(db, actor("gulnar"), { studentId: miras, title: "К врачу", steps: "🚗 | Едем\n⏳ | Ждём\n😊 | Готово" });
    await expect(M.saveStory(db, actor("aigul"), { studentId: miras, title: "X", steps: "a\nb" })).rejects.toBeInstanceOf(AccessDenied);
    await expect(M.saveStory(db, actor("gulnar"), { studentId: miras, title: "Один шаг", steps: "только один" })).rejects.toBeInstanceOf(S.UserError);
    const list = await M.storiesOf(db, actor("miras"), miras);
    expect(list.map((x) => x.title)).toContain("К врачу");
    expect(list.find((x) => x.title === "К врачу")!.steps).toHaveLength(3);
  });
});

describe("bag checklist", () => {
  it("parents hear once when the last thing goes into the bag", async () => {
    const miras = studentId("miras");
    const kid = actor("miras");
    const { items, doneIds } = await M.bagFor(db, miras, S.today());
    const open = items.filter((i) => !doneIds.has(i.id));
    expect(open.length).toBeGreaterThan(0);
    for (const it of open) await M.setBagDone(db, kid, { itemId: it.id, done: true });
    expect(ntfs("gulnar", "ntf.bagDone")).toHaveLength(1);
    // Unticking and ticking again is a new "packed" moment, but ticking a packed item again is not.
    await M.setBagDone(db, kid, { itemId: open[0].id, done: true });
    expect(ntfs("gulnar", "ntf.bagDone")).toHaveLength(1);
  });

  it("only the child ticks the bag, and the list has a size limit", async () => {
    const miras = studentId("miras");
    const { items } = await M.bagFor(db, miras, S.today());
    await expect(M.setBagDone(db, actor("gulnar"), { itemId: items[0].id, done: true })).rejects.toBeInstanceOf(AccessDenied);
    for (let i = items.length; i < D.MAX_BAG_ITEMS; i++) await M.saveBagItem(db, actor("gulnar"), { studentId: miras, title: `вещь ${i}`, icon: "📚" });
    await expect(M.saveBagItem(db, actor("gulnar"), { studentId: miras, title: "лишняя", icon: "📚" })).rejects.toBeInstanceOf(S.UserError);
    await expect(M.saveBagItem(db, actor("gulnar"), { studentId: studentId("aliya"), title: "чужая", icon: "📚" })).rejects.toBeInstanceOf(AccessDenied);
  });
});

describe("saving goal", () => {
  it("the parent pins a reward and the child sees the progress", async () => {
    const miras = studentId("miras");
    const goal = await M.savingGoal(db, miras);
    expect(goal?.reward.title).toBe("@demo.reward.big");
    const { balance } = await S.stars(db, miras);
    expect(goal!.left).toBe(Math.max(0, 25 - balance));
    await M.pinGoal(db, actor("gulnar"), { studentId: miras, rewardId: null });
    expect(await M.savingGoal(db, miras)).toBeNull();
    const aliyaReward = db.select().from(s.rewards).where(eq(s.rewards.studentId, studentId("aliya"))).get()!;
    await expect(M.pinGoal(db, actor("gulnar"), { studentId: miras, rewardId: aliyaReward.id })).rejects.toBeInstanceOf(S.UserError);
  });
});

describe("goal proposals", () => {
  it("a teacher proposes, the psychologist is told and adopts it, the teacher hears back", async () => {
    const miras = studentId("miras");
    await M.proposeGoal(db, actor("aigul"), { studentId: miras, adultText: "Кладёт тетрадь на край парты", childText: "Тетрадь на краю", place: "SCHOOL", reason: "" });
    expect(ntfs("saule", "ntf.proposal")).toHaveLength(1);
    const open = await M.proposalsOf(db, actor("saule"), miras);
    expect(open.length).toBe(2); // one from the demo, one just now
    const mine = await M.proposalsOf(db, actor("aigul"), miras);
    expect(mine.every((r) => r.p.authorId === actor("aigul").id)).toBe(true);
    await M.decideProposals(db, actor("saule"), { studentId: miras, ids: open.map((r) => r.p.id), adopt: true });
    expect(ntfs("aigul", "ntf.proposalAdopted").length).toBe(2);
    expect(await M.proposalsOf(db, actor("saule"), miras)).toHaveLength(0);
  });

  it("each author has at most three open proposals and only the psychologist decides", async () => {
    const miras = studentId("miras");
    const p = { studentId: miras, adultText: "Цель", childText: "Цель", place: "HOME" as const, reason: "" };
    for (let i = 0; i < 3; i++) await M.proposeGoal(db, actor("gulnar"), p);
    await expect(M.proposeGoal(db, actor("gulnar"), p)).rejects.toBeInstanceOf(S.UserError);
    const [one] = await M.proposalsOf(db, actor("gulnar"), miras);
    await expect(M.decideProposals(db, actor("gulnar"), { studentId: miras, ids: [one.p.id], adopt: true })).rejects.toBeInstanceOf(AccessDenied);
    await expect(M.proposeGoal(db, actor("dana"), { ...p, studentId: studentId("sanzhar") })).rejects.toBeInstanceOf(AccessDenied);
  });
});

describe("sleep and medication diary", () => {
  it("the psychologist reads it, the teacher does not, and turning it off deletes the entries", async () => {
    const miras = studentId("miras");
    const h = await M.healthOf(db, actor("saule"), miras);
    expect(h!.logs.length).toBeGreaterThan(5);
    await expect(M.healthOf(db, actor("aigul"), miras)).rejects.toBeInstanceOf(AccessDenied);
    await expect(M.logHealth(db, actor("saule"), { studentId: miras, date: S.today(), sleepHours: 9, medication: null })).rejects.toBeInstanceOf(AccessDenied);
    await M.setHealthEnabled(db, actor("gulnar"), { studentId: miras, enabled: false });
    expect(db.select().from(s.healthLogs).where(eq(s.healthLogs.studentId, miras)).all()).toHaveLength(0);
    expect(await M.healthOf(db, actor("saule"), miras)).toBeNull();
    await expect(M.logHealth(db, actor("gulnar"), { studentId: miras, date: S.today(), sleepHours: 9, medication: null })).rejects.toBeInstanceOf(S.UserError);
  });

  it("validates the date, the hours and the medication, and overwrites the same day", async () => {
    const aliya = studentId("aliya");
    const erlan = actor("erlan");
    await M.setHealthEnabled(db, erlan, { studentId: aliya, enabled: true });
    const bad = (x: Partial<{ date: string; sleepHours: number | null; medication: string | null }>) =>
      expect(M.logHealth(db, erlan, { studentId: aliya, date: S.today(), sleepHours: 9, medication: null, ...x })).rejects.toBeInstanceOf(S.UserError);
    await bad({ date: D.addDays(S.today(), 1) });
    await bad({ date: D.addDays(S.today(), -8) });
    await bad({ sleepHours: 9.2 });
    await bad({ medication: "MAYBE" });
    await bad({ sleepHours: null, medication: null });
    await M.logHealth(db, erlan, { studentId: aliya, date: S.today(), sleepHours: 8, medication: "TAKEN" });
    await M.logHealth(db, erlan, { studentId: aliya, date: S.today(), sleepHours: 9.5, medication: "TAKEN" });
    const logs = db.select().from(s.healthLogs).where(eq(s.healthLogs.studentId, aliya)).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].sleepHours).toBe(9.5);
  });
});

describe("weekly parent report", () => {
  it("summarises the week for the parent and not for strangers", async () => {
    const miras = studentId("miras");
    const monday = D.mondayOf(S.workDay());
    const r = await M.weekReport(db, actor("gulnar"), miras, D.addDays(monday, -7));
    expect(r.ratedDays).toBe(5);
    expect(r.goals.length).toBe(4);
    expect(r.goals.some((g) => g.trend !== null)).toBe(true);
    expect(r.best).not.toBeNull();
    expect(r.starsEarned).toBeGreaterThan(0);
    await expect(M.weekReport(db, actor("erlan"), miras, monday)).rejects.toBeInstanceOf(AccessDenied);
  });
});

describe("e-mail", () => {
  it("queues a letter for people who asked for e-mail and sends it when SMTP works", async () => {
    const gulnar = actor("gulnar");
    await expect(M.setEmailPrefs(db, gulnar, { email: "not-an-email", notify: true, lang: "kk" })).rejects.toBeInstanceOf(S.UserError);
    await expect(M.setEmailPrefs(db, gulnar, { email: "", notify: true, lang: "kk" })).rejects.toBeInstanceOf(S.UserError);
    await expect(M.setEmailPrefs(db, actor("miras"), { email: "m@x.kz", notify: true, lang: "ru" })).rejects.toBeInstanceOf(AccessDenied);
    await M.setEmailPrefs(db, gulnar, { email: "Gulnar@Example.kz", notify: true, lang: "kk" });

    const miras = studentId("miras");
    const { items, doneIds } = await M.bagFor(db, miras, S.today());
    for (const it of items.filter((i) => !doneIds.has(i.id))) await M.setBagDone(db, actor("miras"), { itemId: it.id, done: true });
    const queued = db.select().from(s.emailOutbox).all();
    expect(queued).toHaveLength(1);
    expect(queued[0].to).toBe("gulnar@example.kz");
    expect(queued[0].subject).toContain("сөмке"); // the letter is in the language she chose
    expect(queued[0].status).toBe("PENDING");

    expect(await flushOutbox(db, null)).toEqual({ sent: 0, failed: 0 });
    const sent: string[] = [];
    expect(await flushOutbox(db, { sendMail: async (m: { to?: unknown }) => { sent.push(String(m.to)); return {} as never; } })).toEqual({ sent: 1, failed: 0 });
    expect(sent).toEqual(["gulnar@example.kz"]);
    expect(await flushOutbox(db, { sendMail: async () => ({}) as never })).toEqual({ sent: 0, failed: 0 });
  });

  it("marks a letter as failed when the server refuses it", async () => {
    const u = actor("gulnar");
    db.insert(s.emailOutbox).values({ userId: u.id, to: "x@y.kz", subject: "s", body: "b" }).run();
    expect(await flushOutbox(db, { sendMail: async () => { throw new Error("550"); } })).toEqual({ sent: 0, failed: 1 });
    expect(db.select().from(s.emailOutbox).get()!.status).toBe("FAILED");
  });
});

describe("data export", () => {
  it("the parent gets everything about their child except other adults' forms", async () => {
    const miras = studentId("miras");
    const data = await M.exportStudentData(db, actor("gulnar"), miras);
    expect(data.student.name).toBe("Мирас Сейітов");
    expect(data.marks.length).toBeGreaterThan(50);
    expect(data.myScaleForms.every((f) => f.respondentId === actor("gulnar").id)).toBe(true);
    expect(data.myScaleForms).toHaveLength(1);
    expect(data.healthDiary.length).toBeGreaterThan(0);
    await expect(M.exportStudentData(db, actor("aigul"), miras)).rejects.toBeInstanceOf(AccessDenied);
    await expect(M.exportStudentData(db, actor("erlan"), miras)).rejects.toBeInstanceOf(AccessDenied);
  });

  it("a parent can export even without consent", async () => {
    const data = await M.exportStudentData(db, actor("dana"), studentId("sanzhar"));
    expect(data.marks).toHaveLength(0);
  });
});

describe("consent and show mode", () => {
  it("purging after a revoked consent also removes the new kinds of data", async () => {
    const miras = studentId("miras");
    await S.revokeConsent(db, actor("gulnar"), miras);
    await S.purgeRevokedData(db, new Date(Date.now() + (S.PURGE_AFTER_DAYS + 1) * 86_400_000));
    for (const t of [s.stories, s.bagItems, s.goalPins, s.goalProposals, s.healthLogs, s.healthSettings])
      expect(db.select().from(t).where(eq(t.studentId, miras)).all(), String(t)).toHaveLength(0);
  });

  it("the demo reset brings back the starting data and logs everyone out", async () => {
    const before = db.select().from(s.users).all().length;
    await M.saveStory(db, actor("gulnar"), { studentId: studentId("miras"), title: "Новая", steps: "a\nb" });
    db.insert(s.sessions).values({ id: "x", userId: actor("gulnar").id, expiresAt: new Date(Date.now() + 60_000) }).run();
    resetDemo(db);
    expect(db.select().from(s.users).all()).toHaveLength(before);
    expect(db.select().from(s.stories).all().map((x) => x.title)).toEqual(["@demo.story.title"]);
    expect(db.select().from(s.sessions).all()).toHaveLength(0);
    wipe(db);
    expect(db.select().from(s.users).all()).toHaveLength(0);
  });
});

describe("show mode switch", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });
  const set = (vars: Record<string, string | undefined>) => {
    for (const [k, v] of Object.entries(vars)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  };
  it("is on in development, off in production unless asked for", () => {
    set({ NODE_ENV: "development", DEMO_MODE: undefined });
    expect(demoEnabled()).toBe(true);
    set({ NODE_ENV: "development", DEMO_MODE: "off" });
    expect(demoEnabled()).toBe(false);
    set({ NODE_ENV: "production", DEMO_MODE: undefined });
    expect(demoEnabled()).toBe(false);
    set({ NODE_ENV: "production", DEMO_MODE: "on" });
    expect(demoEnabled()).toBe(true);
  });
});
