// Recreates the database with a demo school. All people and data are fictional.
import fs from "node:fs";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "./index";
import * as s from "./schema";
import { hashPassword } from "../lib/password";
import * as D from "../lib/domain";

export const DEMO_PASSWORD = "demo1234";
export const DEMO_PIN = "123456";

const TECHNIQUES: (typeof s.techniques.$inferInsert)[] = [
  {
    title: "Ежедневная карточка поведения",
    body: "2–4 конкретные цели, отметка после каждого урока, награда дома в тот же день. Цели формулируются как действие, которое можно увидеть.",
    evidence: "STRONG",
    source: "Pyle, Fabiano (2017), Exceptional Children; Moore и соавт. (2018), Review of Education",
  },
  {
    title: "Немедленная конкретная похвала",
    body: "Хвалить сразу после нужного поведения и называть его: «Ты сразу начал задачу, отлично». Соотношение похвалы и замечаний не меньше 4 к 1.",
    evidence: "STRONG",
    source: "Moore и соавт. (2018), Review of Education",
  },
  {
    title: "Короткие и понятные инструкции",
    body: "Одна инструкция за раз, глазной контакт, попросить повторить своими словами. Многошаговые инструкции записывать на доске.",
    evidence: "MODERATE",
    source: "Moore и соавт. (2018), Review of Education",
  },
  {
    title: "Разбивка заданий на части",
    body: "Давать задание частями по 5–10 минут, после каждой части короткая проверка и следующий шаг.",
    evidence: "MODERATE",
    source: "Moore и соавт. (2018), Review of Education",
  },
  {
    title: "Самонаблюдение",
    body: "Тихий сигнал раз в 5–10 минут, ученик сам отмечает, занимается ли он заданием. Сверять с отметкой учителя раз в день.",
    evidence: "MODERATE",
    source: "Исследования одного случая, обзор в Moore и соавт. (2018)",
  },
  {
    title: "Двигательные паузы",
    body: "Разрешённое движение: раздать тетради, отнести журнал, встать у парты. 1–2 минуты каждые 15–20 минут.",
    evidence: "PRACTICE",
    source: "Практика учителей, данные ограничены",
  },
  {
    title: "Место в классе",
    body: "Ближе к учителю, подальше от окна и двери, рядом со спокойным одноклассником.",
    evidence: "PRACTICE",
    source: "Практика учителей, данные ограничены",
  },
  {
    title: "Визуальное расписание урока",
    body: "План урока из 3–5 пунктов на доске, отмечать выполненные пункты. Помогает переключаться между заданиями.",
    evidence: "PRACTICE",
    source: "Принципы универсального дизайна для обучения (UDL)",
  },
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
  db.insert(s.schools).values({ id: schoolId, name: "Школа № 17 (демо)", bellSchedule: bell }).run();

  const user = (login: string, name: string, role: s.Role, hash = pw) => {
    const id = crypto.randomUUID();
    db.insert(s.users).values({ id, schoolId, login, name, role, passwordHash: hash }).run();
    return id;
  };
  const admin = user("admin", "Администратор школы", "ADMIN");
  const olga = user("olga", "Ольга Петровна", "TEACHER");
  const ivan = user("ivan", "Иван Сергеевич", "TEACHER");
  const elena = user("elena", "Елена Соколова", "PARENT");
  const timur = user("timur", "Тимур Ким", "PARENT");
  const marina = user("marina", "Марина Орлова", "PARENT");
  const natalia = user("natalia", "Наталья Викторовна", "PSYCHOLOGIST");
  void admin;

  const class3b = crypto.randomUUID();
  const class4a = crypto.randomUUID();
  db.insert(s.classGroups).values([
    { id: class3b, schoolId, name: "3 «Б»", schoolYear: "2026/2027", teacherId: olga },
    { id: class4a, schoolId, name: "4 «А»", schoolYear: "2026/2027", teacherId: ivan },
  ]).run();

  const child = (login: string, name: string, classId: string, birthYear: number) => {
    const userId = user(login, name, "STUDENT", pin);
    const id = crypto.randomUUID();
    db.insert(s.students).values({ id, userId, classId, displayName: name, birthYear }).run();
    return id;
  };
  const misha = child("misha", "Миша Соколов", class3b, 2017);
  const anya = child("anya", "Аня Ким", class3b, 2017);
  const sasha = child("sasha", "Саша Орлов", class4a, 2016);

  db.insert(s.guardianships).values([
    { parentId: elena, studentId: misha, relation: "мама" },
    { parentId: timur, studentId: anya, relation: "папа" },
    { parentId: marina, studentId: sasha, relation: "мама" },
  ]).run();
  db.insert(s.psychAssignments).values([
    { psychologistId: natalia, studentId: misha },
    { psychologistId: natalia, studentId: anya },
    { psychologistId: natalia, studentId: sasha },
  ]).run();

  // Sasha's mother has not given consent yet, which shows how the platform blocks data collection.
  const fourWeeksAgo = D.addDays(D.mondayOf(todayDate), -21);
  db.insert(s.consents).values([
    { parentId: elena, studentId: misha, textVersion: "2026-10", givenAt: new Date(fourWeeksAgo + "T09:00:00Z") },
    { parentId: timur, studentId: anya, textVersion: "2026-10", givenAt: new Date(fourWeeksAgo + "T09:00:00Z") },
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
      authorId: natalia,
      approvedById: status === "ACTIVE" ? elena : null,
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

  const mishaPlan = plan(misha, 1, "ACTIVE", fourWeeksAgo, [
    { adult: "Начинает задание в течение 2 минут", child: "Начинаю задание сразу" },
    { adult: "Поднимает руку, а не выкрикивает", child: "Поднимаю руку" },
    { adult: "Записывает домашнее задание", child: "Записываю домашку" },
    { adult: "Собирает портфель с вечера", child: "Собираю портфель вечером", place: "HOME" },
  ]);
  const anyaV1 = plan(anya, 1, "ACTIVE", fourWeeksAgo, [
    { adult: "Остаётся на месте до конца задания", child: "Сижу до конца задания" },
    { adult: "Выполняет инструкцию с первого раза", child: "Делаю с первого раза" },
  ], 65, [0, 2, 5]);
  const [anyaG1] = anyaV1.goalIds;
  const anyaLineage = db.select().from(s.goals).all().find((g) => g.id === anyaG1)!.lineageId;
  plan(anya, 2, "PENDING", null, [
    { adult: "Остаётся на месте до конца задания", child: "Сижу до конца задания", lineage: anyaLineage },
    { adult: "Выполняет инструкцию с первого раза", child: "Делаю с первого раза" },
    { adult: "Работает в паре без конфликтов", child: "Работаю в паре дружно" },
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
            db.insert(s.marks).values({ studentId, goalId, date: d, lessonNo: lesson, value, authorId: olga }).run();
          });
        }
        if (homeGoal && d < demoDay)
          db.insert(s.marks).values({ studentId, goalId: homeGoal, date: d, lessonNo: 0, value: rand() < 0.6 + 0.08 * week ? "YES" : "NO", authorId: homeAuthor! }).run();
        if (d < demoDay)
          db.insert(s.dayNotes).values({ studentId, date: d, authorId: olga, text: "", closedAt: new Date(d + "T15:00:00Z") }).run();
      }
      d = D.addDays(d, 1);
    }
  };
  fill(misha, mishaPlan.goalIds.slice(0, 3), [0.45, 0.25, 0.6], 0.1, mishaPlan.goalIds[3], elena);
  fill(anya, anyaV1.goalIds, [0.35, 0.5], 0.06);

  db.insert(s.dayNotes).values({
    studentId: misha,
    date: D.previousSchoolDay(demoDay),
    authorId: olga,
    text: "Хорошо работал в паре на математике, сам вспомнил записать домашку.",
    closedAt: new Date(D.previousSchoolDay(demoDay) + "T15:00:00Z"),
  }).onConflictDoUpdate({ target: [s.dayNotes.studentId, s.dayNotes.date, s.dayNotes.authorId], set: { text: "Хорошо работал в паре на математике, сам вспомнил записать домашку." } }).run();

  const reward = (studentId: string, title: string, cost: number) => {
    const id = crypto.randomUUID();
    db.insert(s.rewards).values({ id, studentId, title, cost }).run();
    return id;
  };
  const game = reward(misha, "15 минут любимой игры", 5);
  reward(misha, "Выбрать мультфильм на вечер", 4);
  const cookies = reward(misha, "Печь вместе печенье", 8);
  reward(misha, "Поход в парк с папой", 12);
  reward(anya, "Выбрать настольную игру на вечер", 5);
  reward(anya, "Рисовать вместе 20 минут", 6);

  // Spend most of the earned history so the balance stays small and realistic (9 stars left).
  const earned = db.select().from(s.marks).all().filter((m) => m.studentId === misha && m.value === "YES").length;
  let left = earned;
  for (let i = 0; left - (i % 3 === 0 ? 8 : 5) >= 9; i++) {
    const cost = i % 3 === 0 ? 8 : 5;
    db.insert(s.rewardRequests).values({
      rewardId: cost === 8 ? cookies : game,
      studentId: misha,
      status: "GRANTED",
      costAtGrant: cost,
      decidedById: elena,
      decidedAt: new Date(D.addDays(fourWeeksAgo, Math.floor(i / 2)) + "T18:00:00Z"),
    }).run();
    left -= cost;
  }
  db.insert(s.rewardRequests).values({ rewardId: game, studentId: misha, status: "PENDING" }).run();

  const hwId = crypto.randomUUID();
  db.insert(s.homework).values({ id: hwId, studentId: misha, subject: "Математика", title: "Учебник, с. 42", dueDate: D.nextSchoolDay(demoDay), authorId: olga }).run();
  ["Открыть тетрадь и учебник на с. 42", "Задача № 1: прочитать и решить", "Задача № 2", "Пример № 3, первый столбик", "Пример № 3, второй столбик", "Показать маме"].forEach(
    (text, position) => db.insert(s.homeworkSteps).values({ homeworkId: hwId, text, position, doneAt: position === 0 ? new Date() : null }).run(),
  );
  const hw2 = crypto.randomUUID();
  db.insert(s.homework).values({ id: hw2, studentId: misha, subject: "Русский язык", title: "Упражнение 87", dueDate: D.nextSchoolDay(demoDay), authorId: elena }).run();
  ["Прочитать задание вслух", "Списать первые 3 предложения", "Подчеркнуть подлежащее", "Списать оставшиеся предложения", "Проверить по образцу"].forEach(
    (text, position) => db.insert(s.homeworkSteps).values({ homeworkId: hw2, text, position }).run(),
  );
}

if (process.argv[1]?.endsWith("seed.ts")) {
  const file = process.env.DATABASE_PATH ?? "./data/nazar.db";
  for (const f of [file, file + "-wal", file + "-shm"]) fs.rmSync(f, { force: true });
  const db = openDb(file);
  migrate(db, { migrationsFolder: "./drizzle" });
  seed(db);
  console.log(`Демо-школа создана. Пароль взрослых: ${DEMO_PASSWORD}, PIN детей: ${DEMO_PIN}.`);
}
