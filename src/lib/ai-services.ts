// AI help through Gemini. Same rules as services.ts, plus three of its own:
// only adults call the AI; the school must turn it on; the parent must allow it for this child.
// Children's names are hidden before anything leaves the school, and every call is written to the school's journal.
// Without a key, over the free quota or on an error, Nazar answers by its own simple rules and says so.
import { and, desc, eq, gte, ne } from "drizzle-orm";
import type { DB } from "@/db";
import { aiCalls, aiConsents, aiSettings, students, users, type AiFeature, type AiSource } from "@/db/schema";
import { AccessDenied, assertCan, hasActiveConsent, type Actor, type Permission } from "./access";
import * as A from "./domain/ai";
import { askGemini, geminiKey, geminiModel, GeminiError, type GeminiAnswer, type GeminiPart } from "./ai/gemini";
import { resolve, type Lang, type MsgKey, type Params } from "./i18n";
import * as S from "./services";

const userError = (key: MsgKey, params?: Params) => new S.UserError([{ key, params }]);

/* =========================== switches =========================== */

export async function schoolAiEnabled(db: DB, schoolId: string): Promise<boolean> {
  const row = await db.query.aiSettings.findFirst({ where: eq(aiSettings.schoolId, schoolId) });
  return Boolean(row?.enabled);
}

export async function aiConsentOf(db: DB, studentId: string): Promise<boolean> {
  const row = await db.query.aiConsents.findFirst({ where: eq(aiConsents.studentId, studentId) });
  return Boolean(row?.allowed);
}

/** The administrator turns the AI buttons on or off for the whole school. */
export async function setSchoolAi(db: DB, actor: Actor, enabled: boolean) {
  if (actor.role !== "ADMIN") throw new AccessDenied();
  const changedAt = new Date();
  db.insert(aiSettings)
    .values({ schoolId: actor.schoolId, enabled, changedById: actor.id, changedAt })
    .onConflictDoUpdate({ target: aiSettings.schoolId, set: { enabled, changedById: actor.id, changedAt } })
    .run();
  S.audit(db, actor, enabled ? "ai.school.on" : "ai.school.off", null);
}

/** A parent allows or stops AI help for their child. Allowing needs the main consent; stopping never does. */
export async function setAiConsent(db: DB, actor: Actor, studentId: string, allowed: boolean) {
  await assertCan(db, actor, "MANAGE_CONSENT", studentId);
  if (allowed && !(await hasActiveConsent(db, studentId))) throw userError("err.aiNeedConsent");
  const changedAt = new Date();
  db.insert(aiConsents)
    .values({ studentId, allowed, changedById: actor.id, changedAt })
    .onConflictDoUpdate({ target: aiConsents.studentId, set: { allowed, changedById: actor.id, changedAt } })
    .run();
  S.audit(db, actor, allowed ? "ai.consent.give" : "ai.consent.revoke", studentId);
}

export type AiGate = "OK" | "DENIED" | "SCHOOL_OFF" | "NO_CONSENT";

/** Whether this adult may use the AI for this child, and if not, why: for showing or hiding the AI buttons. */
export async function aiGate(db: DB, actor: Actor, studentId: string, permission: Permission): Promise<AiGate> {
  // The Gemini API is for people of 18 and over: the AI never answers a child directly.
  if (actor.role === "STUDENT" || actor.role === "ADMIN") return "DENIED";
  try {
    await assertCan(db, actor, permission, studentId);
  } catch {
    return "DENIED";
  }
  if (!(await schoolAiEnabled(db, actor.schoolId))) return "SCHOOL_OFF";
  if (!(await aiConsentOf(db, studentId))) return "NO_CONSENT";
  return "OK";
}

async function requireAi(db: DB, actor: Actor, studentId: string, permission: Permission) {
  const gate = await aiGate(db, actor, studentId, permission);
  if (gate === "DENIED") throw new AccessDenied();
  if (gate === "SCHOOL_OFF") throw userError("err.aiSchoolOff");
  if (gate === "NO_CONSENT") throw userError("err.aiNoConsent");
}

/* =========================== one call, with Nazar's fallback =========================== */

export interface AiResult<T> {
  data: T;
  source: AiSource;
  fallback: A.AiFallback | null;
}

async function withGemini<T>(
  db: DB,
  actor: Actor,
  studentId: string,
  feature: AiFeature,
  ask: () => Promise<GeminiAnswer>,
  parse: (json: unknown) => T,
  offline: () => T,
): Promise<AiResult<T>> {
  let result: AiResult<T>;
  let answer: GeminiAnswer | null = null;
  try {
    answer = await ask();
    result = { data: parse(answer.json), source: "GEMINI", fallback: null };
  } catch (e) {
    const kind: A.AiFallback = e instanceof GeminiError ? e.kind : "FAILED";
    if (!(e instanceof GeminiError)) console.warn(`Nazar AI: ${feature} answer did not fit its shape`);
    else if (kind !== "NO_KEY") console.warn(`Nazar AI: ${feature} ${e.message}`);
    result = { data: offline(), source: "OFFLINE", fallback: kind };
  }
  db.insert(aiCalls)
    .values({
      schoolId: actor.schoolId,
      actorId: actor.id,
      studentId,
      feature,
      source: result.source,
      model: answer?.model ?? (result.fallback === "NO_KEY" ? null : geminiModel()),
      fallback: result.fallback,
      inputTokens: answer?.inputTokens ?? 0,
      outputTokens: answer?.outputTokens ?? 0,
    })
    .run();
  return result;
}

/** The child's name and the names of classmates, to hide them before a text leaves the school. */
async function namesAround(db: DB, studentId: string) {
  const { student } = await S.getStudent(db, studentId);
  const mates = await db.query.students.findMany({ where: and(eq(students.classId, student.classId), ne(students.id, studentId)) });
  return { child: student.displayName, classmates: mates.map((m) => m.displayName) };
}

function checkFile(mime: string, data: string, types: readonly string[], maxBytes: number, typeErr: MsgKey, sizeErr: MsgKey) {
  if (!types.includes(A.baseMime(mime))) throw userError(typeErr);
  if (!/^[A-Za-z0-9+/]+=*$/.test(data) || A.base64Bytes(data) > maxBytes) throw userError(sizeErr, { mb: Math.round(maxBytes / 1_000_000) });
}

/* =========================== 1. photo of a task → steps =========================== */

export async function photoToSteps(db: DB, actor: Actor, input: { studentId: string; mime: string; data: string; lang: Lang }) {
  await requireAi(db, actor, input.studentId, "CREATE_HOMEWORK");
  checkFile(input.mime, input.data, A.AI_IMAGE_TYPES, A.AI_IMAGE_MAX_BYTES, "err.aiImageType", "err.aiImageSize");
  return withGemini(
    db,
    actor,
    input.studentId,
    "PHOTO_STEPS",
    () =>
      askGemini({
        system: A.systemPrompt(input.lang),
        parts: [{ text: A.photoPrompt(input.lang) }, { inline_data: { mime_type: A.baseMime(input.mime), data: input.data } }],
        schema: A.GEMINI_SCHEMAS.steps,
        temperature: 0.3,
      }),
    (json) => A.stepsOut.parse(json),
    () => A.offlineSteps(input.lang),
  );
}

/* =========================== 7. teacher's voice note → marks =========================== */

export async function voiceToMarks(
  db: DB,
  actor: Actor,
  input: { studentId: string; date: string; text?: string; audio?: { mime: string; data: string }; lang: Lang },
) {
  await requireAi(db, actor, input.studentId, "MARK");
  const text = (input.text ?? "").trim();
  if (!text && !input.audio) throw userError("err.aiEmpty");
  if (text.length > A.AI_TEXT_MAX) throw userError("err.aiTextLong", { max: A.AI_TEXT_MAX });
  if (input.audio) checkFile(input.audio.mime, input.audio.data, A.AI_AUDIO_TYPES, A.AI_AUDIO_MAX_BYTES, "err.aiAudioType", "err.aiAudioSize");
  const plan = await S.planFor(db, input.studentId, input.date);
  const goals = plan?.goals.filter((g) => g.place === "SCHOOL") ?? [];
  if (!goals.length) throw userError("err.aiNoGoals");
  const goalTexts = goals.map((g) => resolve(input.lang, g.adultText));
  const { child, classmates } = await namesAround(db, input.studentId);
  const hidden = A.pseudonymize(text, child, classmates);
  const parts: GeminiPart[] = [{ text: A.marksPrompt(input.lang, goalTexts, Boolean(input.audio)) }];
  if (input.audio) parts.push({ inline_data: { mime_type: A.baseMime(input.audio.mime), data: input.audio.data } });
  else parts.push({ text: hidden.text });
  const res = await withGemini(
    db,
    actor,
    input.studentId,
    "VOICE_MARKS",
    () => askGemini({ system: A.systemPrompt(input.lang), parts, schema: A.GEMINI_SCHEMAS.marks, temperature: 0.2 }),
    (json) => A.marksOut.parse(json),
    // A recording cannot be understood by simple rules: then only typed text gives marks.
    () => A.offlineMarks(text, goalTexts),
  );
  // In the answer, goal numbers become goal ids; unknown numbers and "not said" are dropped.
  const marks = res.data.marks
    .filter((m) => m.value !== "NONE" && goals[m.goal - 1])
    .map((m) => ({ goalId: goals[m.goal - 1].id, value: m.value as "YES" | "NO", quote: hidden.restore(m.quote) }));
  const unique = [...new Map(marks.map((m) => [m.goalId, m])).values()];
  return { ...res, data: { transcript: hidden.restore(res.data.transcript), note: hidden.restore(res.data.note), marks: unique, audioOnly: Boolean(input.audio) && !text } };
}

/* =========================== 8. calmer wording =========================== */

export async function softenText(db: DB, actor: Actor, input: { studentId: string; text: string; lang: Lang }) {
  await requireAi(db, actor, input.studentId, "WRITE_NOTE");
  const text = input.text.trim();
  if (!text) throw userError("err.aiEmpty");
  if (text.length > A.AI_TEXT_MAX) throw userError("err.aiTextLong", { max: A.AI_TEXT_MAX });
  const { child, classmates } = await namesAround(db, input.studentId);
  const hidden = A.pseudonymize(text, child, classmates);
  const res = await withGemini(
    db,
    actor,
    input.studentId,
    "SOFTEN",
    () => askGemini({ system: A.systemPrompt(input.lang), parts: [{ text: A.softenPrompt(input.lang, hidden.text) }], schema: A.GEMINI_SCHEMAS.soften, temperature: 0.6 }),
    (json) => A.softenOut.parse(json),
    () => A.offlineSoften(input.lang, hidden.text),
  );
  const options = [...new Set(res.data.options.map((o) => hidden.restore(o).trim()).filter((o) => o && o !== text))];
  return { ...res, data: { options, serious: res.data.serious } };
}

/* =========================== 18. a social story for a situation =========================== */

export async function draftStory(db: DB, actor: Actor, input: { studentId: string; situation: string; lang: Lang }) {
  await requireAi(db, actor, input.studentId, "MANAGE_STORIES");
  const situation = input.situation.trim();
  if (situation.length < 3) throw userError("err.aiEmpty");
  if (situation.length > A.AI_SITUATION_MAX) throw userError("err.aiTextLong", { max: A.AI_SITUATION_MAX });
  const { child, classmates } = await namesAround(db, input.studentId);
  const hidden = A.pseudonymize(situation, child, classmates);
  const res = await withGemini(
    db,
    actor,
    input.studentId,
    "STORY",
    () => askGemini({ system: A.systemPrompt(input.lang), parts: [{ text: A.storyPrompt(input.lang, hidden.text) }], schema: A.GEMINI_SCHEMAS.story, temperature: 0.7 }),
    (json) => A.fixStoryIcons(A.storyOut.parse(json)),
    () => A.offlineStory(input.lang, hidden.text),
  );
  const story = { title: hidden.restore(res.data.title).slice(0, 60), steps: res.data.steps.map((s) => ({ icon: s.icon, text: hidden.restore(s.text).slice(0, 140) })) };
  return { ...res, data: { title: story.title, lines: A.storyToLines(story) } };
}

/* =========================== 21. the school's AI journal =========================== */

export async function aiJournal(db: DB, actor: Actor, limit = 40) {
  if (actor.role !== "ADMIN") throw new AccessDenied();
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [enabled, rows, month] = await Promise.all([
    schoolAiEnabled(db, actor.schoolId),
    db
      .select({ call: aiCalls, name: users.name, role: users.role })
      .from(aiCalls)
      .innerJoin(users, eq(users.id, aiCalls.actorId))
      .where(eq(aiCalls.schoolId, actor.schoolId))
      .orderBy(desc(aiCalls.at))
      .limit(limit),
    db.query.aiCalls.findMany({ where: and(eq(aiCalls.schoolId, actor.schoolId), gte(aiCalls.at, monthStart)) }),
  ]);
  const totals = {
    calls: month.length,
    gemini: month.filter((c) => c.source === "GEMINI").length,
    offline: month.filter((c) => c.source === "OFFLINE").length,
    inputTokens: month.reduce((s, c) => s + c.inputTokens, 0),
    outputTokens: month.reduce((s, c) => s + c.outputTokens, 0),
    // Records about a child: the admin sees that one was sent, never whose or what.
    aboutChild: month.filter((c) => c.studentId).length,
  };
  return { enabled, keySet: Boolean(geminiKey()), model: geminiModel(), rows, totals };
}
