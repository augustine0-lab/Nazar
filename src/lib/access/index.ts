import { and, eq, isNull } from "drizzle-orm";
import type { DB } from "@/db";
import { translate } from "@/lib/i18n";
import { classGroups, consents, guardianships, psychAssignments, students, type Role } from "@/db/schema";

export interface Actor {
  id: string;
  role: Role;
  schoolId: string;
}

export class AccessDenied extends Error {
  constructor() {
    super(translate("ru", "access.denied"));
  }
}

/** How the actor is connected to the student, or null when they are not. */
export async function relationTo(db: DB, actor: Actor, studentId: string): Promise<"SELF" | "TEACHER" | "PARENT" | "PSYCHOLOGIST" | null> {
  switch (actor.role) {
    case "STUDENT": {
      const s = await db.query.students.findFirst({ where: and(eq(students.id, studentId), eq(students.userId, actor.id)) });
      return s ? "SELF" : null;
    }
    case "TEACHER": {
      const [row] = await db
        .select({ id: students.id })
        .from(students)
        .innerJoin(classGroups, eq(classGroups.id, students.classId))
        .where(and(eq(students.id, studentId), eq(classGroups.teacherId, actor.id)));
      return row ? "TEACHER" : null;
    }
    case "PARENT": {
      const g = await db.query.guardianships.findFirst({ where: and(eq(guardianships.parentId, actor.id), eq(guardianships.studentId, studentId)) });
      return g ? "PARENT" : null;
    }
    case "PSYCHOLOGIST": {
      const a = await db.query.psychAssignments.findFirst({
        where: and(eq(psychAssignments.psychologistId, actor.id), eq(psychAssignments.studentId, studentId)),
      });
      return a ? "PSYCHOLOGIST" : null;
    }
    // School admins manage accounts but never see observations.
    case "ADMIN":
      return null;
  }
}

export async function hasActiveConsent(db: DB, studentId: string): Promise<boolean> {
  const c = await db.query.consents.findFirst({ where: and(eq(consents.studentId, studentId), isNull(consents.revokedAt)) });
  return Boolean(c);
}

export type Permission =
  | "VIEW"
  | "MARK"
  | "WRITE_NOTE"
  | "EDIT_PLAN"
  | "APPROVE_PLAN"
  | "MANAGE_REWARDS"
  | "REQUEST_REWARD"
  | "CREATE_HOMEWORK"
  | "DO_HOMEWORK"
  | "MANAGE_CONSENT"
  | "AWARD_HOME_GOAL";

const MATRIX: Record<Permission, Array<"SELF" | "TEACHER" | "PARENT" | "PSYCHOLOGIST">> = {
  VIEW: ["SELF", "TEACHER", "PARENT", "PSYCHOLOGIST"],
  MARK: ["TEACHER"],
  WRITE_NOTE: ["TEACHER", "PARENT", "PSYCHOLOGIST"],
  EDIT_PLAN: ["PSYCHOLOGIST"],
  APPROVE_PLAN: ["PARENT"],
  MANAGE_REWARDS: ["PARENT"],
  REQUEST_REWARD: ["SELF"],
  CREATE_HOMEWORK: ["SELF", "TEACHER", "PARENT"],
  DO_HOMEWORK: ["SELF"],
  MANAGE_CONSENT: ["PARENT"],
  AWARD_HOME_GOAL: ["PARENT"],
};

// Without parental consent only the consent itself can be managed.
const ALLOWED_WITHOUT_CONSENT: Permission[] = ["MANAGE_CONSENT", "VIEW"];

export async function can(db: DB, actor: Actor, permission: Permission, studentId: string): Promise<boolean> {
  const rel = await relationTo(db, actor, studentId);
  if (!rel || !MATRIX[permission].includes(rel)) return false;
  if (ALLOWED_WITHOUT_CONSENT.includes(permission)) return true;
  return hasActiveConsent(db, studentId);
}

export async function assertCan(db: DB, actor: Actor, permission: Permission, studentId: string): Promise<void> {
  if (!(await can(db, actor, permission, studentId))) throw new AccessDenied();
}
