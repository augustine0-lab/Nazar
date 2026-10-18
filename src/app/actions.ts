"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getDb } from "@/db";
import { AccessDenied, type Actor } from "@/lib/access";
import { authenticate } from "@/lib/authenticate";
import { endSession, requireUser, startSession, HOME_BY_ROLE } from "@/lib/session";
import * as S from "@/lib/services";

export type ActionState = { ok?: string; error?: string } | null;

async function actor(): Promise<Actor> {
  const u = await requireUser();
  return { id: u.id, role: u.role, schoolId: u.schoolId };
}

const FLASH_COOKIE = "nazar_flash";

/**
 * Runs a service call and turns expected failures into a message for the form.
 * Success messages go to a short-lived cookie the page shows as a toast, because the form
 * that sent the action often disappears after the change (a granted request, an approved plan).
 */
async function run(fn: (a: Actor) => Promise<unknown>, ok: string, flash = true): Promise<ActionState> {
  try {
    await fn(await actor());
  } catch (e) {
    if (e instanceof S.UserError || e instanceof AccessDenied || e instanceof z.ZodError) {
      return { error: e instanceof z.ZodError ? "Проверьте заполнение полей." : e.message };
    }
    throw e;
  }
  if (flash && ok) (await cookies()).set(FLASH_COOKIE, encodeURIComponent(`${Date.now()}|${ok}`), { maxAge: 20, path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
  return { ok };
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const int = (fd: FormData, k: string) => Number.parseInt(str(fd, k), 10);

/* ---------- auth ---------- */

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const login = str(fd, "login");
  const password = str(fd, "password");
  if (!login || !password) return { error: "Введите логин и пароль." };
  const db = getDb();
  const res = await authenticate(db, login, password);
  if (!res.ok) {
    if (res.reason === "LOCKED") {
      const t = res.lockedUntil!.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: process.env.APP_TZ ?? "Europe/Moscow" });
      return { error: `Слишком много попыток. Вход откроется в ${t}.` };
    }
    return { error: "Неверный логин или пароль." };
  }
  await startSession(res.userId);
  const user = await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, res.userId) });
  redirect(HOME_BY_ROLE[user!.role]);
}

export async function logoutAction() {
  await endSession();
  redirect("/login");
}

/* ---------- marks and notes ---------- */

const markSchema = z.object({
  studentId: z.string().uuid(),
  goalId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  lessonNo: z.number().int().min(0).max(12),
  value: z.enum(["YES", "NO", "NA"]).nullable(),
});

export async function setMarkAction(input: z.infer<typeof markSchema>): Promise<ActionState> {
  return run((a) => S.setMark(getDb(), a, markSchema.parse(input)), "Отметка сохранена", false);
}

export async function saveNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const close = str(fd, "intent") === "close";
  return run(
    (a) => S.saveDayNote(getDb(), a, { studentId: str(fd, "studentId"), date: str(fd, "date"), text: str(fd, "text"), close }),
    close ? "День закрыт, итог отправлен родителю" : "Заметка сохранена",
  );
}

/* ---------- rewards ---------- */

export async function saveRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) =>
      S.saveReward(getDb(), a, {
        studentId: str(fd, "studentId"),
        rewardId: str(fd, "rewardId") || undefined,
        title: str(fd, "title"),
        cost: int(fd, "cost"),
        active: str(fd, "active") !== "off",
      }),
    "Награда сохранена",
  );
}

export async function grantRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) => S.grantReward(getDb(), a, { studentId: str(fd, "studentId"), rewardId: str(fd, "rewardId"), requestId: str(fd, "requestId") || undefined }),
    "Награда выдана",
  );
}

export async function declineRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => S.declineRewardRequest(getDb(), a, { studentId: str(fd, "studentId"), requestId: str(fd, "requestId") }), "Запрос отклонён");
}

export async function requestRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => S.requestReward(getDb(), a, { studentId: str(fd, "studentId"), rewardId: str(fd, "rewardId") }), "Запрос отправлен маме или папе");
}

/* ---------- homework ---------- */

export async function createHomeworkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) =>
      S.createHomework(getDb(), a, {
        studentId: str(fd, "studentId"),
        subject: str(fd, "subject"),
        title: str(fd, "title"),
        dueDate: str(fd, "dueDate"),
        steps: str(fd, "steps").split("\n"),
      }),
    "Задание добавлено",
  );
}

export async function setStepDoneAction(stepId: string, done: boolean): Promise<ActionState> {
  return run((a) => S.setStepDone(getDb(), a, { stepId, done }), done ? "Шаг готов" : "Шаг снова открыт", false);
}

export async function selfCheckAction(studentId: string, homeworkId: string | null, onTask: boolean): Promise<{ starAwarded: boolean } | { error: string }> {
  try {
    return await S.recordSelfCheck(getDb(), await actor(), { studentId, homeworkId, onTask });
  } catch (e) {
    if (e instanceof S.UserError || e instanceof AccessDenied) return { error: e.message };
    throw e;
  } finally {
    revalidatePath("/student", "layout");
  }
}

/* ---------- plan and consent ---------- */

const planSchema = z.object({
  studentId: z.string().uuid(),
  thresholdPct: z.number().int(),
  workMinutes: z.number().int(),
  breakMinutes: z.number().int(),
  goals: z.array(z.object({ adultText: z.string(), childText: z.string(), place: z.enum(["SCHOOL", "HOME"]), lineageId: z.string().nullable() })),
  techniqueIds: z.array(z.string()),
});

export async function submitPlanAction(input: z.infer<typeof planSchema>): Promise<ActionState> {
  return run((a) => {
    const p = planSchema.parse(input);
    return S.submitPlan(getDb(), a, { ...p, goalLineage: p.goals.map((g) => g.lineageId) });
  }, "План отправлен родителю на согласование");
}

export async function approvePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  const planId = str(fd, "planId");
  if (str(fd, "intent") === "decline") return run((a) => S.declinePlan(getDb(), a, { studentId, planId }), "План возвращён психологу");
  let from = "";
  const res = await run(async (a) => {
    from = await S.approvePlan(getDb(), a, { studentId, planId });
  }, "", false);
  if (res?.error) return res;
  const ok = `План согласован и действует с ${from.split("-").reverse().join(".")}`;
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(`${Date.now()}|${ok}`), { maxAge: 20, path: "/", sameSite: "lax" });
  return { ok };
}

export async function consentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  return str(fd, "intent") === "revoke"
    ? run((a) => S.revokeConsent(getDb(), a, studentId), `Согласие отозвано. Сбор данных остановлен, данные будут удалены через ${S.PURGE_AFTER_DAYS} дней.`)
    : run((a) => S.giveConsent(getDb(), a, studentId), "Согласие сохранено");
}

/* ---------- admin ---------- */

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const role = z.enum(["ADMIN", "TEACHER", "PARENT", "PSYCHOLOGIST"]).parse(str(fd, "role"));
  return run((a) => S.createAdultUser(getDb(), a, { login: str(fd, "login"), name: str(fd, "name"), role, password: str(fd, "password") }), "Пользователь создан");
}

export async function createClassAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) => S.createClass(getDb(), a, { name: str(fd, "name"), schoolYear: str(fd, "schoolYear"), teacherId: str(fd, "teacherId") || null }),
    "Класс создан",
  );
}

export async function createStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const by = int(fd, "birthYear");
  return run(
    (a) =>
      S.createStudentAccount(getDb(), a, {
        displayName: str(fd, "displayName"),
        login: str(fd, "login"),
        pin: str(fd, "pin"),
        classId: str(fd, "classId"),
        birthYear: Number.isFinite(by) ? by : null,
      }),
    "Ученик добавлен",
  );
}

export async function linkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  const personId = str(fd, "personId");
  return str(fd, "kind") === "psych"
    ? run((a) => S.assignPsychologist(getDb(), a, { psychologistId: personId, studentId }), "Психолог назначен")
    : run((a) => S.linkParent(getDb(), a, { parentId: personId, studentId, relation: str(fd, "relation") || "родитель" }), "Родитель привязан");
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => S.resetPassword(getDb(), a, { userId: str(fd, "userId"), password: str(fd, "password") }), "Пароль изменён");
}
