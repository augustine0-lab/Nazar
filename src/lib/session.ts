import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { cache } from "react";
import { getDb } from "@/db";
import { sessions, type Role } from "@/db/schema";
import { createSession, userForSession } from "./authenticate";

const COOKIE = "nazar_sid";

export async function startSession(userId: string) {
  const s = await createSession(getDb(), userId);
  (await cookies()).set(COOKIE, s.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: s.expiresAt,
  });
}

export async function endSession() {
  const jar = await cookies();
  const sid = jar.get(COOKIE)?.value;
  if (sid) await getDb().delete(sessions).where(eq(sessions.id, sid));
  jar.delete(COOKIE);
}

export const currentUser = cache(async () => {
  const sid = (await cookies()).get(COOKIE)?.value;
  if (!sid) return null;
  return userForSession(getDb(), sid);
});

export async function requireUser(...roles: Role[]) {
  const user = await currentUser();
  if (!user) redirect("/login");
  if (roles.length && !roles.includes(user.role)) redirect("/");
  return user;
}

export const HOME_BY_ROLE: Record<Role, string> = {
  ADMIN: "/admin",
  TEACHER: "/teacher",
  PARENT: "/parent",
  PSYCHOLOGIST: "/psych",
  STUDENT: "/student",
};
