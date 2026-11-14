// Quiet room: who may enter which room, and the parent's switch. Same rules as services.ts.
// The live room (who is inside now, the timer) is in lib/room/hub.ts and is never stored.
import { eq, inArray } from "drizzle-orm";
import type { DB } from "@/db";
import { classGroups, consents, psychAssignments, roomSettings, students, users } from "@/db/schema";
import { AccessDenied, assertCan, hasActiveConsent, type Actor } from "./access";
import * as D from "./domain";
import type { RoomEntry } from "./room/hub";
import * as S from "./services";

export type RoomChoice = { enabled: boolean; video: boolean; unsupervised: boolean };
const OFF: RoomChoice = { enabled: false, video: false, unsupervised: false };

export async function roomChoiceOf(db: DB, studentId: string): Promise<RoomChoice> {
  const r = await db.query.roomSettings.findFirst({ where: eq(roomSettings.studentId, studentId) });
  return r ? { enabled: r.enabled, video: r.enabled && r.video, unsupervised: r.enabled && r.unsupervised } : OFF;
}

/** How many parents of the class turned the room on, and how many agreed to a room without an adult. Only counts, no names. */
export async function classRoomRule(db: DB, classId: string): Promise<D.RoomRule> {
  const pupils = await db.query.students.findMany({ where: eq(students.classId, classId) });
  if (!pupils.length) return { pupils: 0, enabled: 0, unsupervised: 0 };
  const ids = pupils.map((p) => p.id);
  const [settings, active] = await Promise.all([
    db.query.roomSettings.findMany({ where: inArray(roomSettings.studentId, ids) }),
    db.query.consents.findMany({ where: inArray(consents.studentId, ids) }),
  ]);
  const consented = new Set(active.filter((c) => !c.revokedAt).map((c) => c.studentId));
  const on = settings.filter((s) => s.enabled && consented.has(s.studentId));
  return { pupils: pupils.length, enabled: on.length, unsupervised: on.filter((s) => s.unsupervised).length };
}

/** The parent turns the room on or off for their child. Turning it off also takes back the camera and the agreement. */
export async function setRoomChoice(db: DB, actor: Actor, input: { studentId: string } & RoomChoice) {
  await assertCan(db, actor, "MANAGE_ROOM", input.studentId);
  const choice: RoomChoice = input.enabled ? { enabled: true, video: input.video, unsupervised: input.unsupervised } : OFF;
  const now = new Date();
  db.insert(roomSettings)
    .values({ studentId: input.studentId, ...choice, changedById: actor.id, changedAt: now })
    .onConflictDoUpdate({ target: roomSettings.studentId, set: { ...choice, changedById: actor.id, changedAt: now } })
    .run();
  S.audit(db, actor, choice.enabled ? "room.enable" : "room.disable", input.studentId, { video: choice.video, unsupervised: choice.unsupervised });
  const { student } = await S.getStudent(db, input.studentId);
  return { choice, classId: student.classId, freeAllowed: D.freeRoomAllowed(await classRoomRule(db, student.classId)) };
}

export interface RoomClass {
  id: string;
  name: string;
}

/** Classes whose room this adult may lead: the teacher's own classes, or for a psychologist the classes of their children. */
export async function hostClasses(db: DB, actor: Actor): Promise<RoomClass[]> {
  if (actor.role === "TEACHER") {
    const rows = await db.query.classGroups.findMany({ where: eq(classGroups.teacherId, actor.id) });
    return rows.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name));
  }
  if (actor.role === "PSYCHOLOGIST") {
    const rows = await db
      .selectDistinct({ id: classGroups.id, name: classGroups.name })
      .from(psychAssignments)
      .innerJoin(students, eq(students.id, psychAssignments.studentId))
      .innerJoin(classGroups, eq(classGroups.id, students.classId))
      .where(eq(psychAssignments.psychologistId, actor.id));
    return rows.sort((a, b) => a.name.localeCompare(b.name));
  }
  return [];
}

export type RoomAccess =
  | { ok: true; classId: string; className: string; entry: RoomEntry; rule: D.RoomRule }
  | { ok: false; reason: "noConsent" | "parentOff"; className: string };

/**
 * Who may open the room of a class, checked from the database every time.
 * A pupil only ever gets the room of their own class (classId is ignored), and only when a parent turned it on.
 * Adults are the teacher of the class and the psychologist of a child in it. Nobody else, not the school admin.
 */
export async function roomAccess(db: DB, actor: Actor, classId?: string): Promise<RoomAccess> {
  const user = await db.query.users.findFirst({ where: eq(users.id, actor.id) });
  if (!user) throw new AccessDenied();
  if (actor.role === "STUDENT") {
    const me = await db.query.students.findFirst({ where: eq(students.userId, actor.id) });
    if (!me) throw new AccessDenied();
    const cls = (await db.query.classGroups.findFirst({ where: eq(classGroups.id, me.classId) }))!;
    if (!(await hasActiveConsent(db, me.id))) return { ok: false, reason: "noConsent", className: cls.name };
    const choice = await roomChoiceOf(db, me.id);
    if (!choice.enabled) return { ok: false, reason: "parentOff", className: cls.name };
    const rule = await classRoomRule(db, cls.id);
    return {
      ok: true,
      classId: cls.id,
      className: cls.name,
      rule,
      entry: { userId: actor.id, name: D.firstName(me.displayName), kind: "PUPIL", studentId: me.id, video: choice.video, freeAllowed: D.freeRoomAllowed(rule) },
    };
  }
  const cls = (await hostClasses(db, actor)).find((c) => c.id === classId);
  if (!cls) throw new AccessDenied();
  const rule = await classRoomRule(db, cls.id);
  return {
    ok: true,
    classId: cls.id,
    className: cls.name,
    rule,
    entry: { userId: actor.id, name: user.name, kind: "HOST", studentId: null, video: true, freeAllowed: D.freeRoomAllowed(rule) },
  };
}

