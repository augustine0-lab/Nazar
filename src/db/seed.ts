// Recreates the database with a demo school. All people and data are fictional.
import fs from "node:fs";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "./index";
import * as s from "./schema";
import { hashPassword } from "../lib/password";
import * as D from "../lib/domain";

export const DEMO_PASSWORD = "demo1234";
export const DEMO_PIN = "123456";

// Demo texts are stored as "@<key>" and translated on screen (see src/lib/i18n/messages/demo.ts).
const TECHNIQUES: (typeof s.techniques.$inferInsert)[] = [
  { title: "@demo.tech.card.title", body: "@demo.tech.card.body", evidence: "STRONG", source: "@demo.src.pyle", classSupport: null },
  { title: "@demo.tech.praise.title", body: "@demo.tech.praise.body", evidence: "STRONG", source: "@demo.src.moore", classSupport: "praise" },
  { title: "@demo.tech.instr.title", body: "@demo.tech.instr.body", evidence: "MODERATE", source: "@demo.src.moore", classSupport: "twoWays" },
  { title: "@demo.tech.chunk.title", body: "@demo.tech.chunk.body", evidence: "MODERATE", source: "@demo.src.moore", classSupport: "chunks" },
  { title: "@demo.tech.self.title", body: "@demo.tech.self.body", evidence: "MODERATE", source: "@demo.src.single", classSupport: "checklist" },
  { title: "@demo.tech.move.title", body: "@demo.tech.move.body", evidence: "PRACTICE", source: "@demo.src.practice", classSupport: "move" },
  { title: "@demo.tech.seat.title", body: "@demo.tech.seat.body", evidence: "PRACTICE", source: "@demo.src.practice", classSupport: "space" },
  { title: "@demo.tech.visual.title", body: "@demo.tech.visual.body", evidence: "PRACTICE", source: "@demo.src.udl", classSupport: "board" },
];

/** Small deterministic generator so the demo looks the same on every run. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function seed(db: DB, todayDate = D.isoDate(new Date())) {
  const rand = rng(17);
  // The latest school day gets only its first two lessons marked, so the demo can continue from there.
  const demoDay = D.isSchoolDay(todayDate) ? todayDate : D.previousSchoolDay(todayDate);
  const pw = hashPassword(DEMO_PASSWORD);
  const pin = hashPassword(DEMO_PIN);

  const schoolId = crypto.randomUUID();
  const bell = ["08:30", "09:25", "10:20", "11:20", "12:15"];
  db.insert(s.schools).values({ id: schoolId, name: "@demo.school", bellSchedule: bell }).run();

  const user = (login: string, name: string, role: s.Role, hash = pw) => {
    const id = crypto.randomUUID();
    db.insert(s.users).values({ id, schoolId, login, name, role, passwordHash: hash }).run();
    return id;
  };
  const admin = user("admin", "@demo.adminName", "ADMIN");
  const aigul = user("aigul", "Айгүл Нұрғалиқызы", "TEACHER");
  const nurlan = user("nurlan", "Нұрлан Маратұлы", "TEACHER");
  const gulnar = user("gulnar", "Гүлнар Сейітова", "PARENT");
  const erlan = user("erlan", "Ерлан Қасымов", "PARENT");
  const dana = user("dana", "Дана Әлиева", "PARENT");
  const saule = user("saule", "Сәуле Бақытқызы", "PSYCHOLOGIST");
  void admin;

  const class3b = crypto.randomUUID();
  const class4a = crypto.randomUUID();
  db.insert(s.classGroups).values([
    { id: class3b, schoolId, name: "3 «Б»", schoolYear: "2026/2027", teacherId: aigul },
    { id: class4a, schoolId, name: "4 «А»", schoolYear: "2026/2027", teacherId: nurlan },
  ]).run();

  const child = (login: string, name: string, classId: string, birthYear: number) => {
    const userId = user(login, name, "STUDENT", pin);
    const id = crypto.randomUUID();
    db.insert(s.students).values({ id, userId, classId, displayName: name, birthYear }).run();
    return id;
  };
  const miras = child("miras", "Мирас Сейітов", class3b, 2017);
  const aliya = child("aliya", "Алия Қасымова", class3b, 2017);
  const sanzhar = child("sanzhar", "Санжар Әлиев", class4a, 2016);

  db.insert(s.guardianships).values([
    { parentId: gulnar, studentId: miras, relation: "@demo.mother" },
    { parentId: erlan, studentId: aliya, relation: "@demo.father" },
    { parentId: dana, studentId: sanzhar, relation: "@demo.mother" },
  ]).run();
  db.insert(s.psychAssignments).values([
    { psychologistId: saule, studentId: miras },
    { psychologistId: saule, studentId: aliya },
    { psychologistId: saule, studentId: sanzhar },
  ]).run();

  // Sanzhar's mother has not given consent yet, which shows how the platform blocks data collection.
  const fourWeeksAgo = D.addDays(D.mondayOf(todayDate), -21);
  db.insert(s.consents).values([
    { parentId: gulnar, studentId: miras, textVersion: "2026-10", givenAt: new Date(fourWeeksAgo + "T09:00:00Z") },
    { parentId: erlan, studentId: aliya, textVersion: "2026-10", givenAt: new Date(fourWeeksAgo + "T09:00:00Z") },
  ]).run();

  const techniqueIds = TECHNIQUES.map((t) => {
    const id = crypto.randomUUID();
    db.insert(s.techniques).values({ ...t, id }).run();
    return id;
  });

  const plan = (
    studentId: string,
    version: number,
    status: s.PlanStatus,
    effectiveFrom: string | null,
    goalDefs: { adult: string; child: string; place?: s.GoalPlace; lineage?: string }[],
    thresholdPct = 70,
    techniqueIdx: number[] = [0, 1, 3],
  ) => {
    const id = crypto.randomUUID();
    db.insert(s.supportPlans).values({
      id,
      studentId,
      version,
      status,
      thresholdPct,
      effectiveFrom,
      authorId: saule,
      approvedById: status === "ACTIVE" ? gulnar : null,
      approvedAt: status === "ACTIVE" ? new Date(fourWeeksAgo + "T10:00:00Z") : null,
    }).run();
    const goalIds = goalDefs.map((g, position) => {
      const gid = crypto.randomUUID();
      db.insert(s.goals).values({
        id: gid,
        planId: id,
        lineageId: g.lineage ?? crypto.randomUUID(),
        adultText: g.adult,
        childText: g.child,
        place: g.place ?? "SCHOOL",
        position,
      }).run();
      return gid;
    });
    for (const i of techniqueIdx) db.insert(s.planTechniques).values({ planId: id, techniqueId: techniqueIds[i] }).run();
    return { id, goalIds };
  };

  const mishaPlan = plan(miras, 1, "ACTIVE", fourWeeksAgo, [
    { adult: "@demo.goal.start.adult", child: "@demo.goal.start.child" },
    { adult: "@demo.goal.hand.adult", child: "@demo.goal.hand.child" },
    { adult: "@demo.goal.diary.adult", child: "@demo.goal.diary.child" },
    { adult: "@demo.goal.bag.adult", child: "@demo.goal.bag.child", place: "HOME" },
  ]);
  const anyaV1 = plan(aliya, 1, "ACTIVE", fourWeeksAgo, [
    { adult: "@demo.goal.stay.adult", child: "@demo.goal.stay.child" },
    { adult: "@demo.goal.instr.adult", child: "@demo.goal.instr.child" },
  ], 65, [0, 2, 5]);
  const [anyaG1] = anyaV1.goalIds;
  const anyaLineage = db.select().from(s.goals).all().find((g) => g.id === anyaG1)!.lineageId;
  plan(aliya, 2, "PENDING", null, [
    { adult: "@demo.goal.stay.adult", child: "@demo.goal.stay.child", lineage: anyaLineage },
    { adult: "@demo.goal.instr.adult", child: "@demo.goal.instr.child" },
    { adult: "@demo.goal.pair.adult", child: "@demo.goal.pair.child" },
  ], 70, [0, 2, 5, 6]);

  // History: chances of a YES grow week by week, so the charts show progress.
  const fill = (studentId: string, goalIds: string[], base: number[], step: number, homeGoal?: string, homeAuthor?: string) => {
    let d = fourWeeksAgo;
    let week = 0;
    while (d <= demoDay) {
      if (D.isSchoolDay(d)) {
        week = Math.floor((Date.parse(d) - Date.parse(fourWeeksAgo)) / (7 * 86_400_000));
        const lessons = d === demoDay ? 2 : bell.length;
        for (let lesson = 1; lesson <= lessons; lesson++) {
          goalIds.forEach((goalId, gi) => {
            // Homework is only written down in the last two lessons of the day.
            const value: s.MarkValue = gi === 2 && lesson < 4 ? "NA" : rand() < Math.min(0.95, base[gi] + step * week) ? "YES" : "NO";
            db.insert(s.marks).values({ studentId, goalId, date: d, lessonNo: lesson, value, authorId: aigul }).run();
          });
        }
        if (homeGoal && d < demoDay)
          db.insert(s.marks).values({ studentId, goalId: homeGoal, date: d, lessonNo: 0, value: rand() < 0.6 + 0.08 * week ? "YES" : "NO", authorId: homeAuthor! }).run();
        if (d < demoDay)
          db.insert(s.dayNotes).values({ studentId, date: d, authorId: aigul, text: "", closedAt: new Date(d + "T15:00:00Z") }).run();
      }
      d = D.addDays(d, 1);
    }
  };
  fill(miras, mishaPlan.goalIds.slice(0, 3), [0.45, 0.25, 0.6], 0.1, mishaPlan.goalIds[3], gulnar);
  fill(aliya, anyaV1.goalIds, [0.35, 0.5], 0.06);

  db.insert(s.dayNotes).values({
    studentId: miras,
    date: D.previousSchoolDay(demoDay),
    authorId: aigul,
    text: "@demo.note.pair",
    closedAt: new Date(D.previousSchoolDay(demoDay) + "T15:00:00Z"),
  }).onConflictDoUpdate({ target: [s.dayNotes.studentId, s.dayNotes.date, s.dayNotes.authorId], set: { text: "@demo.note.pair" } }).run();

  const reward = (studentId: string, title: string, cost: number) => {
    const id = crypto.randomUUID();
    db.insert(s.rewards).values({ id, studentId, title, cost }).run();
    return id;
  };
  const game = reward(miras, "@demo.reward.game", 5);
  reward(miras, "@demo.reward.cartoon", 4);
  const cookies = reward(miras, "@demo.reward.cookies", 8);
  reward(miras, "@demo.reward.park", 12);
  reward(aliya, "@demo.reward.board", 5);
  reward(aliya, "@demo.reward.draw", 6);

  // Spend most of the earned history so the balance stays small and realistic (9 stars left).
  const earned = db.select().from(s.marks).all().filter((m) => m.studentId === miras && m.value === "YES").length;
  let left = earned;
  for (let i = 0; left - (i % 3 === 0 ? 8 : 5) >= 9; i++) {
    const cost = i % 3 === 0 ? 8 : 5;
    db.insert(s.rewardRequests).values({
      rewardId: cost === 8 ? cookies : game,
      studentId: miras,
      status: "GRANTED",
      costAtGrant: cost,
      decidedById: gulnar,
      decidedAt: new Date(D.addDays(fourWeeksAgo, Math.floor(i / 2)) + "T18:00:00Z"),
    }).run();
    left -= cost;
  }
  db.insert(s.rewardRequests).values({ rewardId: game, studentId: miras, status: "PENDING" }).run();

  const hwId = crypto.randomUUID();
  db.insert(s.homework).values({ id: hwId, studentId: miras, subject: "@demo.hw.math", title: "@demo.hw.mathTitle", dueDate: D.nextSchoolDay(demoDay), authorId: aigul }).run();
  ["math.s1", "math.s2", "math.s3", "math.s4", "math.s5", "math.s6"].map((k) => `@demo.hw.${k}`).forEach(
    (text, position) => db.insert(s.homeworkSteps).values({ homeworkId: hwId, text, position, doneAt: position === 0 ? new Date() : null }).run(),
  );
  const hw2 = crypto.randomUUID();
  db.insert(s.homework).values({ id: hw2, studentId: miras, subject: "@demo.hw.lang", title: "@demo.hw.langTitle", dueDate: D.nextSchoolDay(demoDay), authorId: gulnar }).run();
  ["lang.s1", "lang.s2", "lang.s3", "lang.s4", "lang.s5"].map((k) => `@demo.hw.${k}`).forEach(
    (text, position) => db.insert(s.homeworkSteps).values({ homeworkId: hw2, text, position }).run(),
  );

  seedExtras({ db, todayDate, demoDay, rand, ids: { aigul, gulnar, erlan, saule, miras, aliya, game } });
  seedMore({ db, todayDate, demoDay, rand, ids: { aigul, gulnar, saule, miras } });
  seedConcepts({
    db,
    demoDay,
    fourWeeksAgo,
    ids: { aigul, saule, miras, aliya, class3b, chunk: techniqueIds[3], move: techniqueIds[5], mirasStart: mishaPlan.goalIds[0], aliyaStay: anyaG1 },
  });
}

/** Demo data for technique trials, Miras's passport, class-wide supports and the lesson board of 3 «Б». */
function seedConcepts({ db, demoDay, fourWeeksAgo, ids }: {
  db: DB;
  demoDay: string;
  fourWeeksAgo: string;
  ids: { aigul: string; saule: string; miras: string; aliya: string; class3b: string; chunk: string; move: string; mirasStart: string; aliyaStay: string };
}) {
  const { aigul, saule, miras, aliya, class3b } = ids;
  const lineage = (goalId: string) => db.select().from(s.goals).all().find((g) => g.id === goalId)!.lineageId;

  // A finished trial for Miras: ten school days of history before it, five days of trying.
  const start = D.nthSchoolDay(fourWeeksAgo, 11);
  const end = D.nthSchoolDay(start, 5);
  if (end < demoDay)
    db.insert(s.trials).values({
      studentId: miras,
      techniqueId: ids.chunk,
      lineageId: lineage(ids.mirasStart),
      howTo: "@demo.trial.howToChunk",
      startDate: start,
      endDate: end,
      status: "DONE",
      decision: "KEEP",
      conclusion: "@demo.trial.concChunk",
      authorId: saule,
      decidedAt: new Date(end + "T15:00:00Z"),
    }).run();

  // Aliya is in the middle of a ten-day trial of movement breaks.
  const aStart = D.schoolDaysBefore(demoDay, 4)[0];
  db.insert(s.trials).values({
    studentId: aliya,
    techniqueId: ids.move,
    lineageId: lineage(ids.aliyaStay),
    howTo: "@demo.trial.howToMove",
    startDate: aStart,
    endDate: D.nthSchoolDay(aStart, 10),
    authorId: saule,
  }).run();

  const f = (k: string) => `@demo.pp.${k}`;
  db.insert(s.passports).values({
    studentId: miras,
    strengths: f("strengths"),
    interests: f("interests"),
    helps: f("helps"),
    hard: f("hard"),
    calming: f("calming"),
    family: f("family"),
    updatedById: aigul,
    updatedAt: new Date(D.addDays(demoDay, -2) + "T16:00:00Z"),
  }).run();

  for (const support of ["goal", "praise", "twoWays", "chunks", "board"])
    db.insert(s.classSupports).values({ classId: class3b, support, enabledById: aigul, enabledAt: new Date(fourWeeksAgo + "T08:00:00Z") }).run();

  const board: [string, number][] = [["👋", 3], ["🔢", 7], ["➗", 12], ["🤸", 3], ["👫", 12], ["✅", 5]];
  db.insert(s.classBoards).values({
    classId: class3b,
    steps: board.map(([icon, minutes], i) => ({ icon, text: `@demo.board.s${i + 1}`, minutes })),
    updatedById: aigul,
    updatedAt: new Date(),
  }).run();
}

/** Empties every table, keeping the schema and the migration history. */
export function wipe(db: DB) {
  const sqlite = db.$client;
  const tables = sqlite
    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'")
    .all() as { name: string }[];
  sqlite.pragma("foreign_keys = OFF");
  try {
    sqlite.transaction(() => {
      for (const { name } of tables) sqlite.prepare(`DELETE FROM "${name.replace(/"/g, '""')}"`).run();
    })();
  } finally {
    sqlite.pragma("foreign_keys = ON");
  }
}

/** Puts the demo school back to its starting state (show mode). Everyone is logged out. */
export function resetDemo(db: DB) {
  wipe(db);
  seed(db);
}

/** Demo data for stories, the bag checklist, the saving goal, a goal proposal and the sleep diary. */
function seedMore({ db, todayDate, demoDay, rand, ids }: {
  db: DB;
  todayDate: string;
  demoDay: string;
  rand: () => number;
  ids: { aigul: string; gulnar: string; saule: string; miras: string };
}) {
  const { aigul, gulnar, saule, miras } = ids;

  db.insert(s.stories).values({
    studentId: miras,
    title: "@demo.story.title",
    steps: [
      { icon: "🔊", text: "@demo.story.s1" },
      { icon: "🎧", text: "@demo.story.s2" },
      { icon: "📓", text: "@demo.story.s3" },
      { icon: "😊", text: "@demo.story.s4" },
    ],
    authorId: saule,
  }).run();

  const bag: [string, string][] = [["📚", "books"], ["📓", "diary"], ["✏️", "pencil"], ["👟", "shoes"], ["💧", "water"]];
  bag.forEach(([icon, key], position) => {
    const id = crypto.randomUUID();
    db.insert(s.bagItems).values({ id, studentId: miras, title: `@demo.bag.${key}`, icon, position }).run();
    if (position < 2) db.insert(s.bagDone).values({ itemId: id, date: todayDate }).run();
  });

  // Most of the picture schedule was ticked on the past two weeks, so the weekly report has numbers.
  const items = db.select().from(s.scheduleItems).all().filter((i) => i.studentId === miras);
  for (let back = 13; back >= 1; back--) {
    const date = D.addDays(todayDate, -back);
    for (const it of items) if (it.weekday === D.weekday(date) && rand() < 0.75) db.insert(s.scheduleDone).values({ itemId: it.id, date }).run();
  }

  const big = crypto.randomUUID();
  db.insert(s.rewards).values({ id: big, studentId: miras, title: "@demo.reward.big", cost: 25 }).run();
  db.insert(s.goalPins).values({ studentId: miras, rewardId: big, setById: gulnar }).run();

  db.insert(s.goalProposals).values({
    studentId: miras,
    authorId: aigul,
    adultText: "@demo.prop.adult",
    childText: "@demo.prop.child",
    place: "SCHOOL",
    reason: "@demo.prop.reason",
  }).run();

  // Sleep diary for three weeks. Fictional: shorter nights are put before weaker school days,
  // so the comparison on the psychologist's screen has something to show.
  db.insert(s.healthSettings).values({ studentId: miras, enabled: true, changedById: gulnar, changedAt: new Date(D.addDays(demoDay, -21) + "T20:00:00Z") }).run();
  const schoolMarks = db.select().from(s.marks).all().filter((m) => m.studentId === miras && m.lessonNo > 0);
  for (let back = 20; back >= 0; back--) {
    const date = D.addDays(demoDay, -back);
    if (date > todayDate) continue;
    const ratio = D.tally(schoolMarks.filter((m) => m.date === date)).ratio;
    const weak = ratio !== null && ratio < 0.6;
    const sleepHours = Math.round(((weak ? 8.2 : 9.4) + (rand() - 0.5)) * 2) / 2;
    db.insert(s.healthLogs).values({ studentId: miras, date, sleepHours, medication: "NONE", authorId: gulnar }).run();
  }
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const file = process.env.DATABASE_PATH ?? "./data/nazar.db";
  for (const f of [file, file + "-wal", file + "-shm"]) fs.rmSync(f, { force: true });
  const db = openDb(file);
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db);
  console.log(`Демо-школа создана / Демо-мектеп жасалды. demo1234 / 123456 (${DEMO_PASSWORD} / ${DEMO_PIN}).`);
}

/** Demo data for the schedule, mood, pet, messages, notifications and observation scales. */
function seedExtras({ db, todayDate, demoDay, rand, ids }: {
  db: DB;
  todayDate: string;
  demoDay: string;
  rand: () => number;
  ids: { aigul: string; gulnar: string; erlan: string; saule: string; miras: string; aliya: string; game: string };
}) {
  const { aigul, gulnar, erlan, saule, miras, aliya, game } = ids;

  // Visual schedule on school days. the first three items are already ticked today.
  const sched: [string, string, s.ScheduleIcon][] = [
    ["07:00", "@demo.sch.wake", "wake"],
    ["07:10", "@demo.sch.wash", "wash"],
    ["07:25", "@demo.sch.eat", "eat"],
    ["07:50", "@demo.sch.bag", "bag"],
    ["08:10", "@demo.sch.school", "school"],
    ["16:30", "@demo.sch.homework", "homework"],
    ["17:30", "@demo.sch.play", "play"],
    ["20:00", "@demo.sch.bath", "bath"],
    ["21:00", "@demo.sch.sleep", "sleep"],
  ];
  const day = D.isSchoolDay(todayDate) ? todayDate : demoDay;
  for (const weekday of [1, 2, 3, 4, 5]) {
    sched.forEach(([time, title, icon], i) => {
      const id = crypto.randomUUID();
      db.insert(s.scheduleItems).values({ id, studentId: miras, weekday, time, title, icon, authorId: gulnar }).run();
      if (weekday === D.weekday(todayDate) && i < 3) db.insert(s.scheduleDone).values({ itemId: id, date: todayDate }).run();
    });
  }
  // A lighter weekend, so the schedule is not empty when the demo is shown on Saturday or Sunday.
  const weekend: [string, string, s.ScheduleIcon][] = [
    ["08:30", "@demo.sch.wake", "wake"],
    ["08:40", "@demo.sch.wash", "wash"],
    ["09:00", "@demo.sch.eat", "eat"],
    ["11:00", "@demo.sch.play", "play"],
    ["20:00", "@demo.sch.bath", "bath"],
    ["21:00", "@demo.sch.sleep", "sleep"],
  ];
  for (const weekday of [6, 7]) {
    weekend.forEach(([time, title, icon], i) => {
      const id = crypto.randomUUID();
      db.insert(s.scheduleItems).values({ id, studentId: miras, weekday, time, title, icon, authorId: gulnar }).run();
      if (weekday === D.weekday(todayDate) && i < 2) db.insert(s.scheduleDone).values({ itemId: id, date: todayDate }).run();
    });
  }
  for (const weekday of [1, 2, 3, 4, 5]) {
    sched.filter((_, i) => [0, 3, 5, 8].includes(i)).forEach(([time, title, icon]) =>
      db.insert(s.scheduleItems).values({ studentId: aliya, weekday, time, title, icon, authorId: erlan }).run(),
    );
  }

  // Mood notes for the last week, a little better towards the end.
  for (const [studentId, base] of [[miras, 2.6], [aliya, 3.4]] as const) {
    for (let back = 6; back >= 0; back--) {
      const date = D.addDays(demoDay, -back);
      if (!D.isSchoolDay(date)) continue;
      for (const slot of s.MOOD_SLOTS) {
        const mood = Math.max(1, Math.min(5, Math.round(base + (6 - back) * 0.12 + (rand() - 0.5) * 2 - (slot === "AFTER_SCHOOL" ? 0.3 : 0))));
        db.insert(s.moodChecks).values({ studentId, date, slot, mood }).run();
      }
    }
  }

  db.insert(s.pets).values({ studentId: miras, kind: "fox", name: "@demo.pet.miras" }).run();

  // A short conversation about Miras; the psychologist's last message is still unread by his mother.
  const t0 = Date.now() - 3 * 3_600_000;
  const msg = (authorId: string, text: string, at: number) =>
    db.insert(s.chatMessages).values({ studentId: miras, authorId, text, createdAt: new Date(at) }).run();
  msg(aigul, "@demo.chat.1", t0);
  msg(gulnar, "@demo.chat.2", t0 + 40 * 60_000);
  msg(saule, "@demo.chat.3", t0 + 90 * 60_000);
  db.insert(s.chatReads).values([
    { userId: gulnar, studentId: miras, readAt: new Date(t0 + 60 * 60_000) },
    { userId: aigul, studentId: miras, readAt: new Date(t0 + 120 * 60_000) },
    { userId: saule, studentId: miras, readAt: new Date(t0 + 120 * 60_000) },
  ]).run();

  db.insert(s.notifications).values([
    { userId: gulnar, studentId: miras, kind: "ntf.chat", params: { child: "Мирас Сейітов" }, href: `/chat/${miras}`, createdAt: new Date(t0 + 90 * 60_000) },
    { userId: gulnar, studentId: miras, kind: "ntf.rewardRequest", params: { child: "Мирас Сейітов", reward: "@demo.reward.game" }, href: `/parent?child=${miras}`, createdAt: new Date(t0 + 30 * 60_000) },
    { userId: erlan, studentId: aliya, kind: "ntf.planPending", params: { child: "Алия Қасымова" }, href: `/parent/plan?child=${aliya}`, createdAt: new Date(t0) },
    { userId: saule, studentId: miras, kind: "ntf.scale", params: { child: "Мирас Сейітов" }, href: `/psych/student/${miras}`, createdAt: new Date(t0 + 20 * 60_000) },
  ]).run();
  void game;

  // Two observation forms for Miras: the teacher sees more inattention at school, the parent more movement at home.
  const form = (respondentId: string, respondentRole: "TEACHER" | "PARENT", answers: number[], daysAgo: number) =>
    db.insert(s.scaleResponses).values({ studentId: miras, respondentId, respondentRole, date: D.addDays(demoDay, -daysAgo), answers }).run();
  form(aigul, "TEACHER", [2, 3, 2, 2, 3, 2, 1, 3, 2, 1, 1, 0, 1, 1, 1, 2, 1, 2], 6);
  form(gulnar, "PARENT", [2, 2, 1, 2, 2, 3, 2, 2, 3, 2, 2, 1, 2, 3, 2, 2, 2, 2], 5);
}
