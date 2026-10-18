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
  { title: "@demo.tech.card.title", body: "@demo.tech.card.body", evidence: "STRONG", source: "@demo.src.pyle" },
  { title: "@demo.tech.praise.title", body: "@demo.tech.praise.body", evidence: "STRONG", source: "@demo.src.moore" },
  { title: "@demo.tech.instr.title", body: "@demo.tech.instr.body", evidence: "MODERATE", source: "@demo.src.moore" },
  { title: "@demo.tech.chunk.title", body: "@demo.tech.chunk.body", evidence: "MODERATE", source: "@demo.src.moore" },
  { title: "@demo.tech.self.title", body: "@demo.tech.self.body", evidence: "MODERATE", source: "@demo.src.single" },
  { title: "@demo.tech.move.title", body: "@demo.tech.move.body", evidence: "PRACTICE", source: "@demo.src.practice" },
  { title: "@demo.tech.seat.title", body: "@demo.tech.seat.body", evidence: "PRACTICE", source: "@demo.src.practice" },
  { title: "@demo.tech.visual.title", body: "@demo.tech.visual.body", evidence: "PRACTICE", source: "@demo.src.udl" },
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
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const file = process.env.DATABASE_PATH ?? "./data/nazar.db";
  for (const f of [file, file + "-wal", file + "-shm"]) fs.rmSync(f, { force: true });
  const db = openDb(file);
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db);
  console.log(`Демо-школа создана / Демо-мектеп жасалды. demo1234 / 123456 (${DEMO_PASSWORD} / ${DEMO_PIN}).`);
}
