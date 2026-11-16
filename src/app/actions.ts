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
import * as C from "@/lib/concept-services";
import * as R from "@/lib/reading-services";
import * as Q from "@/lib/room-services";
import * as X from "@/lib/flex-services";
import * as AI from "@/lib/ai-services";
import { roomHub } from "@/lib/room/hub";
import { flushOutbox } from "@/lib/mailer";
import { demoEnabled } from "@/lib/demo-mode";
import { resetDemo } from "@/db/seed";
import { LANG_COOKIE, LOCALE, isLang, msgText, type MsgKey, type Params } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";
import { APP_TZ, formatDate, freeRoomAllowed, PASSPORT_FIELDS, SCALE_ITEM_COUNT } from "@/lib/domain";

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
  const est = str(fd, "estMinutes").trim();
  const input = {
    studentId: str(fd, "studentId"),
    subject: str(fd, "subject"),
    title: str(fd, "title"),
    dueDate: str(fd, "dueDate"),
    steps: str(fd, "steps").split("\n"),
    estMinutes: est ? Number(est) : null,
  };
  let heavy: Awaited<ReturnType<typeof X.overloadOf>> = null;
  const res = await run(async (a) => {
    await S.createHomework(getDb(), a, input);
    heavy = await X.overloadOf(getDb(), input.studentId, input.dueDate);
  }, null, undefined, false);
  if (res?.error) return res;
  // The ceiling warns and never blocks: the adult who adds the task decides.
  const { lang, t } = await getT();
  const h = heavy as Awaited<ReturnType<typeof X.overloadOf>>;
  const text = h
    ? t("flash.hwHeavy", { date: formatDate(h.evening.dueDate, lang), min: h.evening.likelyMinutes ?? h.evening.estMinutes, norm: h.norm })
    : t("flash.hwAdded");
  await setFlash(text);
  return { ok: text };
}

export async function setStepDoneAction(stepId: string, done: boolean): Promise<ActionState> {
  return run((a) => S.setStepDone(getDb(), a, { stepId, done }), done ? "flash.stepDone" : "flash.stepReopened", undefined, false);
}

export async function selfCheckAction(
  studentId: string,
  homeworkId: string | null,
  onTask: boolean,
  withNoise: boolean | null = null,
): Promise<{ starAwarded: boolean } | { error: string }> {
  try {
    return await S.recordSelfCheck(getDb(), await actor(), { studentId, homeworkId, onTask, withNoise });
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
    ? run(async (a) => {
        const db = getDb();
        await S.revokeConsent(db, a, studentId);
        // AI help ends with the consent and must be allowed again after a new one.
        await AI.setAiConsent(db, a, studentId, false);
        // Without consent the child cannot be in the quiet room either, also not in one that is open now.
        roomHub().applyParentChoice(studentId, { enabled: false, video: false });
        const { student } = await S.getStudent(db, studentId);
        roomHub().setFreeAllowed(student.classId, freeRoomAllowed(await Q.classRoomRule(db, student.classId)));
      }, "flash.consentRevoked", { days: S.PURGE_AFTER_DAYS })
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

/* ---------- trying a technique ---------- */

export async function startTrialAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) =>
      C.startTrial(getDb(), a, {
        studentId: str(fd, "studentId"),
        techniqueId: str(fd, "techniqueId"),
        lineageId: str(fd, "lineageId") || null,
        days: int(fd, "days"),
        howTo: str(fd, "howTo"),
      }),
    "flash.trialStarted",
  );
}

export async function extendTrialAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => C.extendTrial(getDb(), a, { studentId: str(fd, "studentId"), trialId: str(fd, "trialId") }), "flash.trialExtended");
}

export async function finishTrialAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) => C.finishTrial(getDb(), a, { studentId: str(fd, "studentId"), trialId: str(fd, "trialId"), decision: str(fd, "decision"), conclusion: str(fd, "conclusion") }),
    "flash.trialFinished",
  );
}

/* ---------- transition passport and moving a pupil ---------- */

export async function savePassportAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const fields = Object.fromEntries(PASSPORT_FIELDS.map((f) => [f, str(fd, f)])) as Record<(typeof PASSPORT_FIELDS)[number], string>;
  return run((a) => C.savePassport(getDb(), a, { studentId: str(fd, "studentId"), ...fields }), "flash.passportSaved");
}

export async function moveStudentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => C.moveStudent(getDb(), a, { studentId: str(fd, "studentId"), classId: str(fd, "classId") }), "flash.studentMoved");
}

/* ---------- the class as a whole ---------- */

export async function setClassSupportAction(classId: string, support: string, on: boolean): Promise<ActionState> {
  return run((a) => C.setClassSupport(getDb(), a, { classId, support, on }), null, undefined, false);
}

export async function saveBoardAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => C.saveBoard(getDb(), a, { classId: str(fd, "classId"), text: str(fd, "text") }), "flash.boardSaved");
}

/* ---------- living text ---------- */

export async function createReadingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  let id: string | undefined;
  const input = { classId: str(fd, "classId"), title: str(fd, "title"), source: str(fd, "source"), text: str(fd, "text") };
  const res = await run(async (a) => { id = await R.createReading(getDb(), a, input); }, "flash.readingSaved");
  if (id) redirect(`/teacher/read/${id}`);
  return res;
}

export async function updateReadingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const input = { id: str(fd, "id"), title: str(fd, "title"), source: str(fd, "source"), text: str(fd, "text"), scenes: fd.getAll("scene").map(String) };
  return run((a) => R.updateReading(getDb(), a, input), "flash.readingSaved");
}

export async function deleteReadingAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await run((a) => R.deleteReading(getDb(), a, str(fd, "id")), "flash.readingDeleted");
  if (res?.ok) redirect(`/teacher/read?class=${str(fd, "classId")}`);
  return res;
}

/* ---------- quiet room ---------- */

export async function setRoomAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const enabled = str(fd, "enabled") === "on";
  const input = { studentId: str(fd, "studentId"), enabled, video: enabled && str(fd, "video") === "on", unsupervised: enabled && str(fd, "unsupervised") === "on" };
  return run(async (a) => {
    const res = await Q.setRoomChoice(getDb(), a, input);
    // The choice works at once, also in a room that is open right now.
    roomHub().applyParentChoice(input.studentId, res.choice);
    roomHub().setFreeAllowed(res.classId, res.freeAllowed);
  }, enabled ? "flash.roomSaved" : "flash.roomOff");
}

/* ---------- homework that fits the child ---------- */

export async function offerDealAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => X.offerDeal(getDb(), a, { homeworkId: str(fd, "homeworkId"), option: str(fd, "option"), note: str(fd, "note") }), "flash.dealSent");
}

export async function answerDealAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const answer = str(fd, "answer");
  if (answer !== "ACCEPT" && answer !== "DECLINE" && answer !== "COUNTER") return { error: (await getT()).t("err.fields") };
  const ok: MsgKey = answer === "ACCEPT" ? "flash.dealAccepted" : answer === "DECLINE" ? "flash.dealDeclined" : "flash.dealCountered";
  return run((a) => X.answerDeal(getDb(), a, { dealId: str(fd, "dealId"), answer, counter: str(fd, "counter") }), ok);
}

export async function replyCounterAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const accept = str(fd, "accept") === "yes";
  return run((a) => X.replyToCounter(getDb(), a, { dealId: str(fd, "dealId"), accept }), accept ? "flash.dealAccepted" : "flash.dealDeclined");
}

export async function setActualMinutesAction(homeworkId: string, minutes: number): Promise<ActionState> {
  return run((a) => X.setActualMinutes(getDb(), a, { homeworkId, minutes }), "flash.actualSaved");
}

export async function setActualMinutesFormAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => X.setActualMinutes(getDb(), a, { homeworkId: str(fd, "homeworkId"), minutes: int(fd, "minutes") || 0 }), "flash.actualSaved");
}

export async function startSoundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => X.startSoundTrial(getDb(), a, { studentId: str(fd, "studentId"), sound: str(fd, "sound") }), "flash.soundStarted");
}

export async function stopSoundAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run((a) => X.stopSoundTrial(getDb(), a, { studentId: str(fd, "studentId") }), "flash.soundStopped");
}

export async function saveLayoutAction(_: ActionState, fd: FormData): Promise<ActionState> {
  return run(
    (a) => X.saveLayout(getDb(), a, { studentId: str(fd, "studentId"), rows: int(fd, "rows"), cols: int(fd, "cols"), windowSide: str(fd, "windowSide") }),
    "flash.layoutSaved",
  );
}

export async function moveSeatAction(_: ActionState, fd: FormData): Promise<ActionState> {
  // Each place of the plan is a button whose value is "row-col".
  const [row, col] = str(fd, "pos").split("-").map((n) => Number.parseInt(n, 10));
  return run((a) => X.moveSeat(getDb(), a, { studentId: str(fd, "studentId"), row, col }), "flash.seatMoved");
}

/* ---------- AI help (Gemini): only adults, only where the school and the parent allowed it ---------- */

export async function schoolAiAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const on = str(fd, "intent") === "on";
  return run((a) => AI.setSchoolAi(getDb(), a, on), on ? "flash.aiSchoolOn" : "flash.aiSchoolOff");
}

export async function aiConsentAction(_: ActionState, fd: FormData): Promise<ActionState> {
  const on = str(fd, "intent") === "allow";
  return run((a) => AI.setAiConsent(getDb(), a, str(fd, "studentId"), on), on ? "flash.aiConsentOn" : "flash.aiConsentOff");
}

export type AiReply<T> = { ok: true; data: T; source: "GEMINI" | "OFFLINE"; fallback: string | null } | { ok: false; error: string };

/** Runs one AI request and turns expected failures into a message in the reader's language. */
async function runAi<T>(fn: (a: Actor, lang: "ru" | "kk") => Promise<AI.AiResult<T>>): Promise<AiReply<T>> {
  const { lang, t } = await getT();
  try {
    const res = await fn(await actor(), lang);
    return { ok: true, data: res.data, source: res.source, fallback: res.fallback };
  } catch (e) {
    if (e instanceof S.UserError) return { ok: false, error: e.msgs.map((m) => msgText(lang, m)).join(" ") };
    if (e instanceof AccessDenied) return { ok: false, error: t("access.denied") };
    if (e instanceof z.ZodError) return { ok: false, error: t("err.fields") };
    throw e;
  }
}

const fileSchema = z.object({ mime: z.string().max(80), data: z.string().max(8_000_000) });

export async function aiPhotoStepsAction(input: { studentId: string; mime: string; data: string }) {
  const schema = z.object({ studentId: z.string().uuid() }).merge(fileSchema);
  return runAi((a, lang) => AI.photoToSteps(getDb(), a, { ...schema.parse(input), lang }));
}

export async function aiVoiceMarksAction(input: { studentId: string; date: string; text?: string; audio?: { mime: string; data: string } }) {
  const schema = z.object({ studentId: z.string().uuid(), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), text: z.string().max(4000).optional(), audio: fileSchema.optional() });
  return runAi((a, lang) => AI.voiceToMarks(getDb(), a, { ...schema.parse(input), lang }));
}

export async function aiSoftenAction(input: { studentId: string; text: string }) {
  const schema = z.object({ studentId: z.string().uuid(), text: z.string().max(4000) });
  return runAi((a, lang) => AI.softenText(getDb(), a, { ...schema.parse(input), lang }));
}

export async function aiStoryAction(input: { studentId: string; situation: string }) {
  const schema = z.object({ studentId: z.string().uuid(), situation: z.string().max(1000) });
  return runAi((a, lang) => AI.draftStory(getDb(), a, { ...schema.parse(input), lang }));
}
