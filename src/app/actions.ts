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
import * as F from "@/lib/feature-services";
import * as M from "@/lib/more-services";
import { flushOutbox } from "@/lib/mailer";
import { demoEnabled } from "@/lib/demo-mode";
import { resetDemo } from "@/db/seed";
import { LANG_COOKIE, LOCALE, isLang, msgText, type MsgKey, type Params } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { APP_TZ, formatDate, SCALE_ITEM_COUNT } from "@/lib/domain";

export type ActionState = { ok?: string; error?: string } | null;

async function actor(): Promise<Actor> {
  const u = await requireUser();
  return { id: u.id, role: u.role, schoolId: u.schoolId };
}

const FLASH_COOKIE = "nazar_flash";

/**
 * Runs a service call and turns expected failures into a message for the form, in the reader's language.
 * Success messages go to a short-lived cookie the page shows as a toast, because the form
 * that sent the action often disappears after the change (a granted request, an approved plan).
 */
async function run(fn: (a: Actor) => Promise<unknown>, ok: MsgKey | null, params?: Params, flash = true): Promise<ActionState> {
  const { lang, t } = await getT();
  try {
    await fn(await actor());
  } catch (e) {
    if (e instanceof S.UserError) return { error: e.msgs.map((m) => msgText(lang, m)).join(" ") };
    if (e instanceof AccessDenied) return { error: t("access.denied") };
    if (e instanceof z.ZodError) return { error: t("err.fields") };
    throw e;
  }
  // Letters queued by notifications go out right away when SMTP is configured; failures stay in the outbox.
  void flushOutbox(getDb()).catch(() => undefined);
  const text = ok ? t(ok, params) : "";
  if (flash && text) await setFlash(text);
  revalidatePath("/", "layout");
  return { ok: text };
}

async function setFlash(text: string) {
  (await cookies()).set(FLASH_COOKIE, encodeURIComponent(`${Date.now()}|${text}`), { maxAge: 20, path: "/", sameSite: "lax" });
}

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "");
const int = (fd: FormData, k: string) => Number.parseInt(str(fd, k), 10);

/* ---------- language ---------- */

export async function setLangAction(lang: string) {
  if (!isLang(lang)) return;
  (await cookies()).set(LANG_COOKIE, lang, { maxAge: 365 * 86_400, path: "/", sameSite: "lax" });
  revalidatePath("/", "layout");
}

/* ---------- auth ---------- */

export async function loginAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const login = str(fd, "login");
  const password = str(fd, "password");
  if (!login || !password) return { error: (await getT()).t("err.needCreds") };
  const db = getDb();
  const res = await authenticate(db, login, password);
  if (!res.ok) {
    if (res.reason === "LOCKED") {
      const { lang, t } = await getT();
      const time = res.lockedUntil!.toLocaleTimeString(LOCALE[lang], { hour: "2-digit", minute: "2-digit", timeZone: APP_TZ });
      return { error: t("err.locked", { time }) };
    }
    return { error: (await getT()).t("err.badLogin") };
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
  return run((a) => S.setMark(getDb(), a, markSchema.parse(input)), "flash.markSaved", undefined, false);
}

export async function saveNoteAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const close = str(fd, "intent") === "close";
  return run(
    (a) => S.saveDayNote(getDb(), a, { studentId: str(fd, "studentId"), date: str(fd, "date"), text: str(fd, "text"), close }),
    close ? "flash.dayClosed" : "flash.noteSaved",
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
    "flash.rewardSaved",
  );
}

export async function grantRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) => S.grantReward(getDb(), a, { studentId: str(fd, "studentId"), rewardId: str(fd, "rewardId"), requestId: str(fd, "requestId") || undefined }),
    "flash.rewardGranted",
  );
}

export async function declineRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => S.declineRewardRequest(getDb(), a, { studentId: str(fd, "studentId"), requestId: str(fd, "requestId") }), "flash.requestDeclined");
}

export async function requestRewardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => S.requestReward(getDb(), a, { studentId: str(fd, "studentId"), rewardId: str(fd, "rewardId") }), "flash.requestSent");
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
    "flash.hwAdded",
  );
}

export async function setStepDoneAction(stepId: string, done: boolean): Promise<ActionState> {
  return run((a) => S.setStepDone(getDb(), a, { stepId, done }), done ? "flash.stepDone" : "flash.stepReopened", undefined, false);
}

export async function selfCheckAction(studentId: string, homeworkId: string | null, onTask: boolean): Promise<{ starAwarded: boolean } | { error: string }> {
  try {
    return await S.recordSelfCheck(getDb(), await actor(), { studentId, homeworkId, onTask });
  } catch (e) {
    if (e instanceof S.UserError || e instanceof AccessDenied) {
      const { lang, t } = await getT();
      return { error: e instanceof S.UserError ? e.msgs.map((m) => msgText(lang, m)).join(" ") : t("access.denied") };
    }
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
  adoptedProposalIds: z.array(z.string()).optional(),
});

export async function submitPlanAction(input: z.infer<typeof planSchema>): Promise<ActionState> {
  return run(async (a) => {
    const { adoptedProposalIds, ...p } = planSchema.parse(input);
    await S.submitPlan(getDb(), a, { ...p, goalLineage: p.goals.map((g) => g.lineageId) });
    if (adoptedProposalIds?.length) await M.decideProposals(getDb(), a, { studentId: p.studentId, ids: adoptedProposalIds, adopt: true });
  }, "flash.planSent");
}

export async function approvePlanAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  const planId = str(fd, "planId");
  if (str(fd, "intent") === "decline") return run((a) => S.declinePlan(getDb(), a, { studentId, planId }), "flash.planReturned");
  let from = "";
  const res = await run(async (a) => {
    from = await S.approvePlan(getDb(), a, { studentId, planId });
  }, null);
  if (res?.error) return res;
  const { lang, t } = await getT();
  const ok = t("flash.planApproved", { date: formatDate(from, lang) });
  await setFlash(ok);
  return { ok };
}

export async function consentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  return str(fd, "intent") === "revoke"
    ? run((a) => S.revokeConsent(getDb(), a, studentId), "flash.consentRevoked", { days: S.PURGE_AFTER_DAYS })
    : run((a) => S.giveConsent(getDb(), a, studentId), "flash.consentSaved");
}

/* ---------- admin ---------- */

export async function createUserAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const role = z.enum(["ADMIN", "TEACHER", "PARENT", "PSYCHOLOGIST"]).parse(str(fd, "role"));
  return run((a) => S.createAdultUser(getDb(), a, { login: str(fd, "login"), name: str(fd, "name"), role, password: str(fd, "password") }), "flash.userCreated");
}

export async function createClassAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) => S.createClass(getDb(), a, { name: str(fd, "name"), schoolYear: str(fd, "schoolYear"), teacherId: str(fd, "teacherId") || null }),
    "flash.classCreated",
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
    "flash.studentAdded",
  );
}

export async function linkAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const studentId = str(fd, "studentId");
  const personId = str(fd, "personId");
  return str(fd, "kind") === "psych"
    ? run((a) => S.assignPsychologist(getDb(), a, { psychologistId: personId, studentId }), "flash.psychAssigned")
    : run(async (a) => S.linkParent(getDb(), a, { parentId: personId, studentId, relation: str(fd, "relation") || (await getT()).t("common.parent") }), "flash.parentLinked");
}

export async function resetPasswordAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => S.resetPassword(getDb(), a, { userId: str(fd, "userId"), password: str(fd, "password") }), "flash.passwordChanged");
}

/* ---------- mood, pet, schedule ---------- */

export async function logMoodAction(studentId: string, slot: "MORNING" | "AFTER_SCHOOL", mood: number): Promise<ActionState> {
  const res = await run((a) => F.logMood(getDb(), a, { studentId, slot, mood }), null);
  revalidatePath("/student", "layout");
  return res;
}

export async function choosePetAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => F.choosePet(getDb(), a, { studentId: str(fd, "studentId"), kind: str(fd, "kind"), name: str(fd, "name") }), "flash.petSaved");
}

export async function saveScheduleItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) =>
      F.saveScheduleItem(getDb(), a, {
        studentId: str(fd, "studentId"),
        weekdays: fd.getAll("weekday").map((v) => Number.parseInt(String(v), 10)),
        time: str(fd, "time"),
        title: str(fd, "title"),
        icon: str(fd, "icon"),
      }),
    "flash.schedSaved",
  );
}

export async function deleteScheduleItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => F.deleteScheduleItem(getDb(), a, { studentId: str(fd, "studentId"), itemId: str(fd, "itemId") }), "flash.schedDeleted");
}

export async function setScheduleDoneAction(itemId: string, done: boolean): Promise<ActionState> {
  const res = await run((a) => F.setScheduleDone(getDb(), a, { itemId, done }), null);
  revalidatePath("/student", "layout");
  return res;
}

/* ---------- messages and notifications ---------- */

export async function sendChatAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => F.sendChat(getDb(), a, { studentId: str(fd, "studentId"), text: str(fd, "text") }), null);
}

export async function markNotificationsReadAction() {
  const a = await actor();
  await F.markNotificationsRead(getDb(), a.id);
  revalidatePath("/", "layout");
}

/* ---------- observation scale ---------- */

export async function submitScaleAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const answers = Array.from({ length: SCALE_ITEM_COUNT }, (_, i) => Number.parseInt(str(fd, `a${i + 1}`), 10));
  return run((a) => F.submitScale(getDb(), a, { studentId: str(fd, "studentId"), answers }), "flash.scaleSaved");
}

/* ---------- show mode ---------- */

export async function demoLoginAction(fd: FormData) {
  if (!demoEnabled()) redirect("/login");
  const login = str(fd, "login");
  const user = await getDb().query.users.findFirst({ where: (u, { eq }) => eq(u.login, login) });
  if (!user) redirect("/demo");
  await startSession(user.id);
  redirect(HOME_BY_ROLE[user.role]);
}

export async function resetDemoAction() {
  if (!demoEnabled()) redirect("/login");
  resetDemo(getDb());
  (await cookies()).delete("nazar_sid");
  await setFlash((await getT()).t("flash.demoReset"));
  revalidatePath("/", "layout");
  redirect("/demo");
}

/* ---------- social stories ---------- */

export async function saveStoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => M.saveStory(getDb(), a, { studentId: str(fd, "studentId"), title: str(fd, "title"), steps: str(fd, "steps") }), "flash.storySaved");
}

export async function deleteStoryAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => M.deleteStory(getDb(), a, { studentId: str(fd, "studentId"), storyId: str(fd, "storyId") }), "flash.storyDeleted");
}

/* ---------- bag checklist ---------- */

export async function saveBagItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => M.saveBagItem(getDb(), a, { studentId: str(fd, "studentId"), title: str(fd, "title"), icon: str(fd, "icon") }), "flash.bagSaved");
}

export async function deleteBagItemAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => M.deleteBagItem(getDb(), a, { studentId: str(fd, "studentId"), itemId: str(fd, "itemId") }), "flash.bagDeleted");
}

export async function setBagDoneAction(itemId: string, done: boolean): Promise<ActionState> {
  const res = await run((a) => M.setBagDone(getDb(), a, { itemId, done }), null);
  revalidatePath("/student", "layout");
  return res;
}

/* ---------- saving goal and goal proposals ---------- */

export async function pinGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => M.pinGoal(getDb(), a, { studentId: str(fd, "studentId"), rewardId: str(fd, "rewardId") || null }), "flash.goalSaved");
}

export async function proposeGoalAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const place = str(fd, "place") === "HOME" ? "HOME" : "SCHOOL";
  return run(
    (a) => M.proposeGoal(getDb(), a, { studentId: str(fd, "studentId"), adultText: str(fd, "adultText"), childText: str(fd, "childText"), place, reason: str(fd, "reason") }),
    "flash.proposalSent",
  );
}

export async function dismissProposalAction(studentId: string, id: string): Promise<ActionState> {
  return run((a) => M.decideProposals(getDb(), a, { studentId, ids: [id], adopt: false }), "flash.proposalDismissed", undefined, false);
}

/* ---------- sleep diary ---------- */

export async function setHealthEnabledAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const enabled = str(fd, "enabled") === "on";
  return run((a) => M.setHealthEnabled(getDb(), a, { studentId: str(fd, "studentId"), enabled }), enabled ? "flash.healthOn" : "flash.healthOff");
}

export async function logHealthAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const sleep = str(fd, "sleep").replace(",", ".");
  const medication = str(fd, "medication");
  return run(
    (a) =>
      M.logHealth(getDb(), a, {
        studentId: str(fd, "studentId"),
        date: str(fd, "date"),
        sleepHours: sleep === "" ? null : Number(sleep),
        medication: medication || null,
      }),
    "flash.healthSaved",
  );
}

/* ---------- account ---------- */

export async function saveEmailPrefsAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => M.setEmailPrefs(getDb(), a, { email: str(fd, "email"), notify: str(fd, "notify") === "on", lang: str(fd, "lang") }), "flash.emailSaved");
}
