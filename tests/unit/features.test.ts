import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import { AccessDenied, can, type Actor } from "@/lib/access";
import * as S from "@/lib/services";
import * as F from "@/lib/feature-services";
import * as D from "@/lib/domain";
import { notificationText } from "@/lib/notification-text";
import { parsePrefs, serializePrefs } from "@/lib/prefs";

let db: DB;
const actor = (login: string): Actor => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return { id: u.id, role: u.role, schoolId: u.schoolId };
};
const studentId = (login: string) => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return db.select().from(s.students).where(eq(s.students.userId, u.id)).get()!.id;
};

beforeEach(() => {
  db = openDb(":memory:");
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db, S.today());
});

describe("domain rules of the new features", () => {
  it("the pet grows with lifetime stars and never beyond the last stage", () => {
    expect(D.petStage(0)).toEqual({ stage: 0, last: false, toNext: 8 });
    expect(D.petStage(8).stage).toBe(1);
    expect(D.petStage(49).stage).toBe(2);
    expect(D.petStage(90)).toEqual({ stage: 4, last: true, toNext: 0 });
    expect(D.petStage(5000).stage).toBe(4);
  });

  it("scores the observation scale and flags six concerns of nine", () => {
    const none = D.scoreScale(Array(18).fill(1));
    expect(none.inattention).toEqual({ sum: 9, concerns: 0, flagged: false });
    const some = D.scoreScale([...Array(6).fill(2), 0, 0, 0, ...Array(9).fill(3)]);
    expect(some.inattention.flagged).toBe(true);
    expect(some.hyperactivity).toEqual({ sum: 27, concerns: 9, flagged: true });
    const five = D.scoreScale([...Array(5).fill(3), ...Array(13).fill(0)]);
    expect(five.inattention.flagged).toBe(false);
  });

  it("validates scale answers", () => {
    expect(D.validScaleAnswers(Array(18).fill(0))).toBe(true);
    expect(D.validScaleAnswers(Array(17).fill(0))).toBe(false);
    expect(D.validScaleAnswers([...Array(17).fill(0), 4])).toBe(false);
    expect(D.validScaleAnswers([...Array(17).fill(0), Number.NaN])).toBe(false);
  });

  it("finds goals below the threshold on three or more rated days", () => {
    const day = (r: number | null) => ({ g1: { yes: 0, no: 0, na: 0, ratio: r } });
    expect(D.strugglingGoals([day(0.4), day(0.5), day(0.2), day(0.9), day(null)], ["g1"], 70)).toEqual([{ goalId: "g1", badDays: 3, ratedDays: 4 }]);
    expect(D.strugglingGoals([day(0.4), day(0.5), day(0.9), day(0.9), day(null)], ["g1"], 70)).toEqual([]);
  });

  it("suggests only techniques that are not in the plan, best evidence first", () => {
    const all = [
      { id: "a", title: "A", evidence: "PRACTICE" as const },
      { id: "b", title: "B", evidence: "STRONG" as const },
      { id: "c", title: "C", evidence: "MODERATE" as const },
    ];
    expect(D.suggestTechniques(all, new Set(["b"])).map((t) => t.id)).toEqual(["c", "a"]);
  });

  it("walks through the schedule and cycles the movement breaks", () => {
    const items = [{ id: "1" }, { id: "2" }, { id: "3" }];
    expect(D.scheduleProgress(items, new Set(["1"]))).toEqual({ done: 1, total: 3, currentId: "2" });
    expect(D.scheduleProgress(items, new Set(["1", "2", "3"])).currentId).toBeNull();
    expect(D.exerciseForCycle(0)).not.toBe(D.exerciseForCycle(1));
    expect(D.exerciseForCycle(D.BREAK_EXERCISES.length)).toBe(D.exerciseForCycle(0));
    expect(D.byTime([{ time: "10:00" }, { time: "07:30" }]).map((i) => i.time)).toEqual(["07:30", "10:00"]);
  });

  it("view settings survive a round trip and ignore garbage", () => {
    const p = { fs: 2 as const, rd: true, th: "dark" as const, cm: true };
    expect(parsePrefs(serializePrefs(p))).toEqual(p);
    expect(parsePrefs("fs=9&th=pink&x")).toEqual({ fs: 0, rd: false, th: "auto", cm: false });
    expect(parsePrefs(undefined)).toEqual({ fs: 0, rd: false, th: "auto", cm: false });
  });
});

describe("messages between adults", () => {
  it("lets the three adults of a child talk and nobody else", async () => {
    const miras = studentId("miras");
    expect(await can(db, actor("gulnar"), "CHAT", miras)).toBe(true);
    expect(await can(db, actor("aigul"), "CHAT", miras)).toBe(true);
    expect(await can(db, actor("saule"), "CHAT", miras)).toBe(true);
    expect(await can(db, actor("miras"), "CHAT", miras)).toBe(false);
    expect(await can(db, actor("erlan"), "CHAT", miras)).toBe(false);
    expect(await can(db, actor("nurlan"), "CHAT", miras)).toBe(false);
    await expect(F.sendChat(db, actor("erlan"), { studentId: miras, text: "Привет" })).rejects.toBeInstanceOf(AccessDenied);
  });

  it("works only with parental consent", async () => {
    const sanzhar = studentId("sanzhar");
    expect(await can(db, actor("nurlan"), "CHAT", sanzhar)).toBe(false);
  });

  it("counts unread messages per reader and clears them when the conversation is opened", async () => {
    const miras = studentId("miras");
    expect((await F.chatThreads(db, actor("gulnar")))[0].unread).toBe(1);
    await F.sendChat(db, actor("aigul"), { studentId: miras, text: "Добрый вечер" });
    expect((await F.chatThreads(db, actor("gulnar")))[0].unread).toBe(2);
    expect((await F.chatThreads(db, actor("aigul")))[0].unread).toBe(0);
    await F.openChat(db, actor("gulnar"), miras);
    expect((await F.chatThreads(db, actor("gulnar")))[0].unread).toBe(0);
    // and the bell stops announcing the messages that were just read
    expect((await F.unreadNotifications(db, actor("gulnar").id)).some((n) => n.kind === "ntf.chat")).toBe(false);
  });

  it("notifies the other adults but not the sender, and rejects empty or long text", async () => {
    const miras = studentId("miras");
    const before = (await F.unreadNotifications(db, actor("saule").id)).length;
    await F.sendChat(db, actor("gulnar"), { studentId: miras, text: "Спасибо!" });
    expect((await F.unreadNotifications(db, actor("saule").id)).length).toBe(before + 1);
    const mine = await F.notificationsOf(db, actor("gulnar").id);
    expect(mine.some((n) => n.createdAt.getTime() > Date.now() - 5_000)).toBe(false);
    await expect(F.sendChat(db, actor("gulnar"), { studentId: miras, text: "   " })).rejects.toBeInstanceOf(S.UserError);
    await expect(F.sendChat(db, actor("gulnar"), { studentId: miras, text: "x".repeat(F.MAX_CHAT_LENGTH + 1) })).rejects.toBeInstanceOf(S.UserError);
  });
});

describe("notifications", () => {
  it("tells the parent when the teacher closes the day", async () => {
    const miras = studentId("miras");
    const gulnar = actor("gulnar");
    const before = (await F.unreadNotifications(db, gulnar.id)).length;
    await S.saveDayNote(db, actor("aigul"), { studentId: miras, date: S.workDay(), text: "Хороший день", close: true });
    const after = await F.unreadNotifications(db, gulnar.id);
    expect(after.length).toBe(before + 1);
    expect(after.some((n) => n.kind === "ntf.dayClosed")).toBe(true);
    await S.saveDayNote(db, actor("aigul"), { studentId: miras, date: S.workDay(), text: "Ещё раз", close: false });
    expect((await F.unreadNotifications(db, gulnar.id)).length).toBe(before + 1);
  });

  it("tells the parent about a reward request and a new plan, and the psychologist about the approval", async () => {
    const aliya = studentId("aliya");
    const erlan = actor("erlan");
    const base = (await F.unreadNotifications(db, erlan.id)).length;
    await S.submitPlan(db, actor("saule"), {
      studentId: aliya,
      thresholdPct: 70,
      workMinutes: 10,
      breakMinutes: 3,
      goals: [{ adultText: "a", childText: "b", place: "SCHOOL" }],
      goalLineage: [null],
      techniqueIds: [],
    });
    expect((await F.unreadNotifications(db, erlan.id)).length).toBe(base + 1);
    const plan = (await S.plansOf(db, aliya)).find((p) => p.status === "PENDING")!;
    const saule = actor("saule");
    const before = (await F.unreadNotifications(db, saule.id)).length;
    await S.approvePlan(db, erlan, { studentId: aliya, planId: plan.id });
    expect((await F.unreadNotifications(db, saule.id)).length).toBe(before + 1);
  });

  it("marks only the reader's own notifications as read", async () => {
    await F.markNotificationsRead(db, actor("gulnar").id);
    expect(await F.unreadNotifications(db, actor("gulnar").id)).toHaveLength(0);
    expect((await F.unreadNotifications(db, actor("saule").id)).length).toBeGreaterThan(0);
  });

  it("translates stored notifications, including demo names inside them", () => {
    const n = { kind: "ntf.rewardRequest", params: { child: "Мирас", reward: "@demo.reward.game" } };
    expect(notificationText("ru", n)).toBe("Мирас просит награду «15 минут любимой игры»");
    expect(notificationText("kk", n)).toContain("«15 минут сүйікті ойын»");
    expect(notificationText("ru", { kind: "unknown.key", params: null })).toBe("unknown.key");
  });
});

describe("visual schedule", () => {
  it("lets a parent edit and the child tick items, only for today", async () => {
    const miras = studentId("miras");
    const gulnar = actor("gulnar");
    await F.saveScheduleItem(db, gulnar, { studentId: miras, weekdays: [1, 2, 3, 4, 5, 6, 7], time: "12:00", title: "Обед", icon: "eat" });
    const day = await F.scheduleForDay(db, miras, S.today());
    const lunch = day.items.find((i) => i.title === "Обед")!;
    expect(lunch).toBeTruthy();
    await F.setScheduleDone(db, actor("miras"), { itemId: lunch.id, done: true });
    expect((await F.scheduleForDay(db, miras, S.today())).doneIds.has(lunch.id)).toBe(true);
    await F.setScheduleDone(db, actor("miras"), { itemId: lunch.id, done: false });
    expect((await F.scheduleForDay(db, miras, S.today())).doneIds.has(lunch.id)).toBe(false);
    await expect(F.setScheduleDone(db, gulnar, { itemId: lunch.id, done: true })).rejects.toBeInstanceOf(AccessDenied);
    await expect(F.saveScheduleItem(db, actor("miras"), { studentId: miras, weekdays: [1], time: "12:00", title: "x", icon: "eat" })).rejects.toBeInstanceOf(AccessDenied);
  });

  it("cannot tick an item of another weekday", async () => {
    const miras = studentId("miras");
    const other = D.weekday(S.today()) === 1 ? 2 : 1;
    await F.saveScheduleItem(db, actor("saule"), { studentId: miras, weekdays: [other], time: "05:00", title: "Другой день", icon: "wake" });
    const item = (await F.scheduleOf(db, miras)).find((i) => i.title === "Другой день")!;
    await expect(F.setScheduleDone(db, actor("miras"), { itemId: item.id, done: true })).rejects.toBeInstanceOf(S.UserError);
  });

  it("validates time, title, icon and days", async () => {
    const miras = studentId("miras");
    const base = { studentId: miras, weekdays: [1], time: "07:30", title: "Подъём", icon: "wake" };
    const g = actor("gulnar");
    await expect(F.saveScheduleItem(db, g, { ...base, time: "7:30" })).rejects.toBeInstanceOf(S.UserError);
    await expect(F.saveScheduleItem(db, g, { ...base, title: " " })).rejects.toBeInstanceOf(S.UserError);
    await expect(F.saveScheduleItem(db, g, { ...base, icon: "rocket" })).rejects.toBeInstanceOf(S.UserError);
    await expect(F.saveScheduleItem(db, g, { ...base, weekdays: [] })).rejects.toBeInstanceOf(S.UserError);
  });

  it("removes an item with its ticks", async () => {
    const miras = studentId("miras");
    const item = (await F.scheduleOf(db, miras))[0];
    await F.deleteScheduleItem(db, actor("gulnar"), { studentId: miras, itemId: item.id });
    expect((await F.scheduleOf(db, miras)).some((i) => i.id === item.id)).toBe(false);
  });
});

describe("mood and pet", () => {
  it("records one mood per slot and day and lets the adults read it", async () => {
    const miras = studentId("miras");
    await F.logMood(db, actor("miras"), { studentId: miras, slot: "MORNING", mood: 2 });
    await F.logMood(db, actor("miras"), { studentId: miras, slot: "MORNING", mood: 5 });
    const today = (await F.moodsOf(db, miras, S.today())).filter((m) => m.date === S.today() && m.slot === "MORNING");
    expect(today.map((m) => m.mood)).toEqual([5]);
    await expect(F.logMood(db, actor("miras"), { studentId: miras, slot: "MORNING", mood: 6 })).rejects.toBeInstanceOf(S.UserError);
    await expect(F.logMood(db, actor("gulnar"), { studentId: miras, slot: "MORNING", mood: 3 })).rejects.toBeInstanceOf(AccessDenied);
    await expect(F.logMood(db, actor("aliya"), { studentId: miras, slot: "MORNING", mood: 3 })).rejects.toBeInstanceOf(AccessDenied);
  });

  it("keeps the pet's growth when stars are spent", async () => {
    const miras = studentId("miras");
    const before = await F.petOf(db, miras);
    expect(before.pet?.kind).toBe("fox");
    expect(before.stage).toBe(4);
    await S.grantReward(db, actor("gulnar"), { studentId: miras, rewardId: (await S.rewardsOf(db, miras))[0].id });
    expect((await F.petOf(db, miras)).lifetime).toBe(before.lifetime);
  });

  it("lets only the child choose a pet, with a name and a known kind", async () => {
    const aliya = studentId("aliya");
    expect((await F.petOf(db, aliya)).pet).toBeNull();
    await F.choosePet(db, actor("aliya"), { studentId: aliya, kind: "owl", name: " Сова " });
    expect((await F.petOf(db, aliya)).pet).toMatchObject({ kind: "owl", name: "Сова" });
    await expect(F.choosePet(db, actor("aliya"), { studentId: aliya, kind: "dragon", name: "x" })).rejects.toBeInstanceOf(S.UserError);
    await expect(F.choosePet(db, actor("aliya"), { studentId: aliya, kind: "cat", name: "" })).rejects.toBeInstanceOf(S.UserError);
    await expect(F.choosePet(db, actor("erlan"), { studentId: aliya, kind: "cat", name: "Мурка" })).rejects.toBeInstanceOf(AccessDenied);
  });
});

describe("observation scales", () => {
  const answers = (v: number) => Array(18).fill(v);

  it("shows the psychologist every form and everyone else only their own", async () => {
    const miras = studentId("miras");
    expect(await F.scalesOf(db, actor("saule"), miras)).toHaveLength(2);
    expect((await F.scalesOf(db, actor("aigul"), miras)).map((r) => r.respondentRole)).toEqual(["TEACHER"]);
    expect((await F.scalesOf(db, actor("gulnar"), miras)).map((r) => r.respondentRole)).toEqual(["PARENT"]);
    await expect(F.scalesOf(db, actor("erlan"), miras)).rejects.toBeInstanceOf(AccessDenied);
    await expect(F.scalesOf(db, actor("miras"), miras)).rejects.toBeInstanceOf(AccessDenied);
  });

  it("replaces a form filled in twice on the same day and notifies the psychologist", async () => {
    const aliya = studentId("aliya");
    const saule = actor("saule");
    const base = (await F.unreadNotifications(db, saule.id)).length;
    await F.submitScale(db, actor("erlan"), { studentId: aliya, answers: answers(1) });
    await F.submitScale(db, actor("erlan"), { studentId: aliya, answers: answers(3) });
    const rows = await F.scalesOf(db, saule, aliya);
    expect(rows).toHaveLength(1);
    expect(rows[0].score.inattention.flagged).toBe(true);
    expect((await F.unreadNotifications(db, saule.id)).length).toBe(base + 2);
  });

  it("rejects incomplete forms and people who may not fill them", async () => {
    const aliya = studentId("aliya");
    await expect(F.submitScale(db, actor("erlan"), { studentId: aliya, answers: [1, 2, 3] })).rejects.toBeInstanceOf(S.UserError);
    await expect(F.submitScale(db, actor("saule"), { studentId: aliya, answers: answers(1) })).rejects.toBeInstanceOf(AccessDenied);
    await expect(F.submitScale(db, actor("gulnar"), { studentId: aliya, answers: answers(1) })).rejects.toBeInstanceOf(AccessDenied);
  });
});

describe("weekly class review", () => {
  it("lists the class with struggling goals and technique hints", async () => {
    const rows = await F.classWeek(db, actor("aigul"), D.mondayOf(S.workDay()));
    expect(rows.map((r) => r.displayName).sort()).toEqual(["Алия Қасымова", "Мирас Сейітов"]);
    const aliya = rows.find((r) => r.displayName.startsWith("Алия"))!;
    if (!aliya.consent) throw new Error("consent expected");
    expect(aliya.week).toHaveLength(5);
    expect(aliya.struggling.length).toBeGreaterThan(0);
    expect(aliya.hints.length).toBeGreaterThan(0);
    const inPlan = new Set(aliya.plan!.techniques.map((t) => t.id));
    expect(aliya.hints.every((h) => !inPlan.has(h.id))).toBe(true);
  });

  it("is for the class teacher only and hides children without consent", async () => {
    await expect(F.classWeek(db, actor("gulnar"), D.mondayOf(S.workDay()))).rejects.toBeInstanceOf(S.UserError);
    const rows = await F.classWeek(db, actor("nurlan"), D.mondayOf(S.workDay()));
    expect(rows).toHaveLength(1);
    expect(rows[0].consent).toBe(false);
  });
});

describe("printable report", () => {
  it("is available to the psychologist and the parent, not to teachers, other parents or the child", async () => {
    const miras = studentId("miras");
    expect((await F.reportData(db, actor("saule"), miras)).student.displayName).toBe("Мирас Сейітов");
    expect((await F.reportData(db, actor("gulnar"), miras)).student.id).toBe(miras);
    await expect(F.reportData(db, actor("aigul"), miras)).rejects.toBeInstanceOf(AccessDenied);
    await expect(F.reportData(db, actor("erlan"), miras)).rejects.toBeInstanceOf(AccessDenied);
    await expect(F.reportData(db, actor("miras"), miras)).rejects.toBeInstanceOf(AccessDenied);
  });

  it("shows observation forms to the psychologist only", async () => {
    const miras = studentId("miras");
    expect((await F.reportData(db, actor("saule"), miras)).scales).toHaveLength(2);
    expect((await F.reportData(db, actor("gulnar"), miras)).scales).toHaveLength(0);
  });
});

describe("consent revoked long ago", () => {
  it("removes mood, messages, scales, schedule and notifications of the child", async () => {
    const miras = studentId("miras");
    db.update(s.consents).set({ revokedAt: new Date(Date.now() - 40 * 86_400_000) }).where(eq(s.consents.studentId, miras)).run();
    await S.purgeRevokedData(db);
    expect(db.select().from(s.moodChecks).where(eq(s.moodChecks.studentId, miras)).all()).toHaveLength(0);
    expect(db.select().from(s.chatMessages).where(eq(s.chatMessages.studentId, miras)).all()).toHaveLength(0);
    expect(db.select().from(s.scaleResponses).where(eq(s.scaleResponses.studentId, miras)).all()).toHaveLength(0);
    expect(db.select().from(s.scheduleItems).where(eq(s.scheduleItems.studentId, miras)).all()).toHaveLength(0);
    expect(db.select().from(s.notifications).where(eq(s.notifications.studentId, miras)).all()).toHaveLength(0);
  });
});
