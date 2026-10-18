// Who gets told about what. Kept apart from the services so that both service files can use it.
import { eq } from "drizzle-orm";
import type { DB } from "@/db";
import type { MsgKey, Params } from "@/lib/i18n";
import { and, inArray } from "drizzle-orm";
import { classGroups, emailOutbox, guardianships, notifications, psychAssignments, students, users } from "@/db/schema";
import { notificationText } from "./notification-text";
import { translate } from "./i18n";

/** Everyone connected to the child, except the given user: parents, class teacher, psychologists. */
export async function adultsOf(db: DB, studentId: string, exceptUserId?: string): Promise<{ id: string; role: "PARENT" | "TEACHER" | "PSYCHOLOGIST" }[]> {
  const parents = await db.select({ id: guardianships.parentId }).from(guardianships).where(eq(guardianships.studentId, studentId));
  const [teacher] = await db
    .select({ id: classGroups.teacherId })
    .from(students)
    .innerJoin(classGroups, eq(classGroups.id, students.classId))
    .where(eq(students.id, studentId));
  const psychs = await db.select({ id: psychAssignments.psychologistId }).from(psychAssignments).where(eq(psychAssignments.studentId, studentId));
  const all = [
    ...parents.map((p) => ({ id: p.id, role: "PARENT" as const })),
    ...(teacher?.id ? [{ id: teacher.id, role: "TEACHER" as const }] : []),
    ...psychs.map((p) => ({ id: p.id, role: "PSYCHOLOGIST" as const })),
  ];
  return all.filter((a) => a.id !== exceptUserId);
}

export function notify(db: DB, userIds: string[], kind: MsgKey, params: Params, studentId: string | null, href: string | null) {
  const ids = [...new Set(userIds)];
  for (const userId of ids) db.insert(notifications).values({ userId, studentId, kind, params, href }).run();
  if (!ids.length) return;
  // A copy goes to the outbox for people who asked for e-mail; it is sent by flushOutbox when SMTP is configured.
  const readers = db.select().from(users).where(and(inArray(users.id, ids), eq(users.emailNotify, true))).all();
  for (const u of readers) {
    if (!u.email) continue;
    const text = notificationText(u.emailLang, { kind, params });
    const link = href && process.env.APP_URL ? `\n\n${process.env.APP_URL.replace(/\/$/, "")}${href}` : "";
    db.insert(emailOutbox)
      .values({ userId: u.id, to: u.email, subject: `Nazar: ${text}`, body: `${text}${link}\n\n${translate(u.emailLang, "mail.footer")}` })
      .run();
  }
}
