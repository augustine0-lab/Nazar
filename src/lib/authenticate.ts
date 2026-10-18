import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import type { DB } from "@/db";
import { sessions, users } from "@/db/schema";
import { verifyPassword } from "./password";

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
export const SESSION_DAYS = 14;

export type AuthResult =
  | { ok: true; userId: string }
  | { ok: false; reason: "INVALID" | "LOCKED"; lockedUntil?: Date };

export async function authenticate(db: DB, login: string, password: string, now = new Date()): Promise<AuthResult> {
  const user = await db.query.users.findFirst({ where: eq(users.login, login.trim().toLowerCase()) });
  if (!user) return { ok: false, reason: "INVALID" };
  if (user.lockedUntil && user.lockedUntil > now) return { ok: false, reason: "LOCKED", lockedUntil: user.lockedUntil };

  if (!verifyPassword(password, user.passwordHash)) {
    const failed = user.failedLogins + 1;
    const lockedUntil = failed >= MAX_FAILED_LOGINS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
    await db
      .update(users)
      .set({ failedLogins: lockedUntil ? 0 : failed, lockedUntil })
      .where(eq(users.id, user.id));
    return lockedUntil ? { ok: false, reason: "LOCKED", lockedUntil } : { ok: false, reason: "INVALID" };
  }

  await db.update(users).set({ failedLogins: 0, lockedUntil: null }).where(eq(users.id, user.id));
  return { ok: true, userId: user.id };
}

export async function createSession(db: DB, userId: string, now = new Date()): Promise<{ id: string; expiresAt: Date }> {
  const id = randomBytes(32).toString("base64url");
  const expiresAt = new Date(now.getTime() + SESSION_DAYS * 86_400_000);
  await db.insert(sessions).values({ id, userId, expiresAt });
  return { id, expiresAt };
}

export async function userForSession(db: DB, sessionId: string, now = new Date()) {
  const s = await db.query.sessions.findFirst({ where: eq(sessions.id, sessionId) });
  if (!s) return null;
  if (s.expiresAt <= now) {
    await db.delete(sessions).where(eq(sessions.id, sessionId));
    return null;
  }
  const user = await db.query.users.findFirst({ where: eq(users.id, s.userId) });
  return user ?? null;
}
