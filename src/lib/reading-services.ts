// Living text: the teacher of a class writes a reading in short chapters, the pupils of that class read it.
// Nothing here is about one child, so no consent is needed. Same rules as services.ts.
import { and, desc, eq } from "drizzle-orm";
import type { DB } from "@/db";
import type { MsgKey, Params } from "@/lib/i18n";
import { classGroups, readings, students } from "@/db/schema";
import { AccessDenied, type Actor } from "./access";
import * as D from "./domain";
import * as S from "./services";

const err = (key: MsgKey, params?: Params) => new S.UserError([{ key, params }]);

async function assertClassTeacher(db: DB, actor: Actor, classId: string) {
  const c = actor.role === "TEACHER" ? await db.query.classGroups.findFirst({ where: and(eq(classGroups.id, classId), eq(classGroups.teacherId, actor.id)) }) : null;
  if (!c) throw new AccessDenied();
  return c;
}

/** The class whose readings this person may open: the teacher's chosen class, or the pupil's own. */
async function classOfStudent(db: DB, actor: Actor) {
  if (actor.role !== "STUDENT") throw new AccessDenied();
  const me = await db.query.students.findFirst({ where: eq(students.userId, actor.id) });
  if (!me) throw new AccessDenied();
  return me.classId;
}

export type Reading = Omit<typeof readings.$inferSelect, "chapters"> & { chapters: D.Chapter[] };
const typed = (r: typeof readings.$inferSelect): Reading => ({
  ...r,
  chapters: r.chapters.map((c, i) => ({ ...c, scene: D.isScene(c.scene) ? c.scene : D.pickScene(c.title, c.text, i) })),
});

/** Readings of a class, newest first: for its teacher, or for a pupil of that class (classId is ignored then). */
export async function readingsOf(db: DB, actor: Actor, classId?: string) {
  const cid = actor.role === "STUDENT" ? await classOfStudent(db, actor) : (await assertClassTeacher(db, actor, classId ?? "")).id;
  const rows = await db.query.readings.findMany({ where: eq(readings.classId, cid), orderBy: desc(readings.createdAt) });
  return rows.map(typed);
}

export async function readingFor(db: DB, actor: Actor, id: string) {
  const r = await db.query.readings.findFirst({ where: eq(readings.id, id) });
  if (!r) throw new AccessDenied();
  if (actor.role === "STUDENT") {
    if ((await classOfStudent(db, actor)) !== r.classId) throw new AccessDenied();
  } else await assertClassTeacher(db, actor, r.classId);
  return typed(r);
}

function checkChapters(chapters: D.Chapter[]) {
  if (!chapters.length || chapters.length > D.MAX_CHAPTERS) throw err("err.readChapters", { max: D.MAX_CHAPTERS });
  if (chapters.some((c) => c.title.length > D.MAX_CHAPTER_TITLE)) throw err("err.readChapterTitle", { max: D.MAX_CHAPTER_TITLE });
  if (chapters.some((c) => c.text.length > D.MAX_CHAPTER_TEXT)) throw err("err.readChapterLong", { max: D.MAX_CHAPTER_TEXT });
}

export async function createReading(db: DB, actor: Actor, input: { classId: string; title: string; source: string; text: string }) {
  await assertClassTeacher(db, actor, input.classId);
  const title = input.title.trim();
  const source = input.source.trim();
  if (!title || title.length > D.MAX_READING_TITLE || source.length > D.MAX_READING_TITLE) throw err("err.readTitle", { max: D.MAX_READING_TITLE });
  const chapters = D.parseChapters(input.text);
  checkChapters(chapters);
  const row = db.insert(readings).values({ classId: input.classId, title, source, chapters, authorId: actor.id }).returning().get();
  S.audit(db, actor, "reading.create", null, { classId: input.classId, n: chapters.length });
  return row.id;
}

/** The teacher may change the text and the picture of every chapter. */
export async function updateReading(db: DB, actor: Actor, input: { id: string; title: string; source: string; text: string; scenes: string[] }) {
  const r = await readingFor(db, actor, input.id);
  if (actor.role !== "TEACHER") throw new AccessDenied();
  const title = input.title.trim();
  const source = input.source.trim();
  if (!title || title.length > D.MAX_READING_TITLE || source.length > D.MAX_READING_TITLE) throw err("err.readTitle", { max: D.MAX_READING_TITLE });
  const chapters = D.parseChapters(input.text).map((c, i) => {
    const s = input.scenes[i];
    return s && D.isScene(s) ? { ...c, scene: s } : c;
  });
  checkChapters(chapters);
  db.update(readings).set({ title, source, chapters }).where(eq(readings.id, r.id)).run();
  S.audit(db, actor, "reading.update", null, { classId: r.classId, n: chapters.length });
}

export async function deleteReading(db: DB, actor: Actor, id: string) {
  const r = await readingFor(db, actor, id);
  if (actor.role !== "TEACHER") throw new AccessDenied();
  db.delete(readings).where(eq(readings.id, r.id)).run();
  S.audit(db, actor, "reading.delete", null, { classId: r.classId });
}
