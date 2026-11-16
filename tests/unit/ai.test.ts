import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import type { Actor } from "@/lib/access";
import * as S from "@/lib/services";
import * as AI from "@/lib/ai-services";
import * as A from "@/lib/domain/ai";
import { setGeminiFetch } from "@/lib/ai/gemini";

/* ---------- pure rules ---------- */

describe("names stay at school", () => {
  it("hides every form of the child's and classmates' names and puts them back", () => {
    const text = "Мирасу сегодня было трудно, Сейітов дважды вставал. Алия ему помогла, Алияға рахмет.";
    const p = A.pseudonymize(text, "Мирас Сейітов", ["Алия Қасымова", "Мирас Сейітов"]);
    expect(p.text).toBe("[имя] сегодня было трудно, [имя] дважды вставал. [ученик 2] ему помогла, [ученик 2] рахмет.");
    expect(p.text).not.toMatch(/Мирас|Алия|Сейіт/);
    expect(p.restore("У [имя] получилось, [ученик 2] рядом.")).toBe("У Мирас получилось, Алия рядом.");
  });

  it("does not touch words that only start like a name", () => {
    // "Алиюшка" is a name form (4 letters more), "Мирасовский" is too long to be one.
    expect(A.hideNames("Мирасовский проспект", ["Мирас"])).toBe("Мирасовский проспект");
    expect(A.nameParts("Ли Мирас")).toEqual(["Мирас"]);
  });

  it("measures base64 without decoding and strips codec parameters", () => {
    expect(A.base64Bytes(Buffer.from("hello world").toString("base64"))).toBe(11);
    expect(A.baseMime("audio/webm;codecs=opus")).toBe("audio/webm");
  });
});

describe("Nazar's own answers without Gemini", () => {
  const goals = ["Начинает задание в течение 2 минут", "Поднимает руку, а не выкрикивает", "Остаётся на месте до конца задания"];

  it("marks only the goals the note talks about", () => {
    const res = A.offlineMarks("Дважды вставал, но сам вернулся. Руку поднимал.", goals);
    expect(res.marks.map((m) => [m.goal, m.value])).toEqual([[2, "YES"], [3, "NO"]]);
    expect(A.offlineMarks("Сегодня был концерт.", goals).marks).toEqual([]);
  });

  it("works for Kazakh notes too", () => {
    const kk = ["Тапсырманы 2 минут ішінде бастайды", "Қол көтереді, айғайламайды"];
    const res = A.offlineMarks("Қолын көтерді. Тапсырманы бірден бастамады, алаңдады.", kk);
    expect(res.marks.map((m) => [m.goal, m.value])).toEqual([[1, "NO"], [2, "YES"]]);
  });

  it("swaps harsh words for a description and keeps the capital letter", () => {
    expect(A.offlineSoften("ru", "Опять сорвал урок и мешал соседям!!").options[0]).toBe("Сегодня на уроке было трудно усидеть и отвлекал(а) соседей.");
    expect(A.offlineSoften("kk", "Тағы да тыңдамайды").options[0]).toBe("Бүгін нұсқауды бірден естімеді");
  });

  it("gives a story frame that fits the editor and its pictures", () => {
    const st = A.offlineStory("ru", "контрольная в новом кабинете.");
    expect(st.title).toBe("Контрольная в новом кабинете");
    expect(st.steps[0].text).toContain("контрольная в новом кабинете");
    expect(A.storyOut.safeParse(st).success).toBe(true);
    expect(st.steps.every((x) => (A.STORY_ICONS as readonly string[]).includes(x.icon))).toBe(true);
    expect(A.storyToLines(st).split("\n")[0]).toBe("📅 | Скоро будет вот что: контрольная в новом кабинете.");
  });

  it("replaces a picture outside the set", () => {
    expect(A.fixStoryIcons({ title: "x", steps: [{ icon: "🦄", text: "a" }, { icon: "⭐", text: "b" }, { icon: "🙂", text: "c" }] }).steps.map((x) => x.icon)).toEqual(["➡️", "⭐", "🙂"]);
  });
});

/* ---------- services on the demo school ---------- */

let db: DB;
const actorByLogin = (login: string): Actor => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return { id: u.id, role: u.role, schoolId: u.schoolId };
};
const studentId = (login: string) => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return db.select().from(s.students).where(eq(s.students.userId, u.id)).get()!.id;
};

type Sent = { url: string; headers: Record<string, string>; body: string };
function fakeGemini(answer: unknown, status = 200, error?: unknown) {
  const sent: Sent[] = [];
  setGeminiFetch((async (url: string, init: RequestInit) => {
    sent.push({ url, headers: init.headers as Record<string, string>, body: String(init.body) });
    const body = status === 200 ? { candidates: [{ content: { parts: [{ text: JSON.stringify(answer) }] } }], usageMetadata: { promptTokenCount: 120, candidatesTokenCount: 40 }, modelVersion: "gemini-test" } : (error ?? { error: { code: status } });
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  }) as unknown as typeof fetch);
  return sent;
}

describe("AI help on the demo school", () => {
  beforeEach(() => {
    db = openDb(":memory:");
    migrate(db, { migrationsFolder: "./drizzle" });
    seed(db, S.today());
    delete process.env.GEMINI_API_KEY;
  });
  afterEach(() => {
    setGeminiFetch(null);
    delete process.env.GEMINI_API_KEY;
  });

  it("opens only for adults, where the school turned it on and the parent allowed it", async () => {
    const aigul = actorByLogin("aigul");
    expect(await AI.aiGate(db, aigul, studentId("miras"), "MARK")).toBe("OK");
    expect(await AI.aiGate(db, aigul, studentId("aliya"), "MARK")).toBe("NO_CONSENT");
    expect(await AI.aiGate(db, actorByLogin("miras"), studentId("miras"), "CREATE_HOMEWORK")).toBe("DENIED");
    expect(await AI.aiGate(db, actorByLogin("nurlan"), studentId("miras"), "MARK")).toBe("DENIED");
    await AI.setSchoolAi(db, actorByLogin("admin"), false);
    expect(await AI.aiGate(db, aigul, studentId("miras"), "MARK")).toBe("SCHOOL_OFF");
    await expect(AI.softenText(db, aigul, { studentId: studentId("miras"), text: "Опять мешал", lang: "ru" })).rejects.toThrow(S.UserError);
    await expect(AI.setSchoolAi(db, aigul, true)).rejects.toThrow();
  });

  it("lets a parent allow AI help only with the main consent, and stops it with the consent", async () => {
    const dana = actorByLogin("dana");
    await expect(AI.setAiConsent(db, dana, studentId("sanzhar"), true)).rejects.toThrow(S.UserError);
    const erlan = actorByLogin("erlan");
    await AI.setAiConsent(db, erlan, studentId("aliya"), true);
    expect(await AI.aiGate(db, actorByLogin("aigul"), studentId("aliya"), "MARK")).toBe("OK");
    await expect(AI.setAiConsent(db, actorByLogin("gulnar"), studentId("aliya"), true)).rejects.toThrow();
    await S.revokeConsent(db, erlan, studentId("aliya"));
    expect(await AI.aiGate(db, actorByLogin("aigul"), studentId("aliya"), "MARK")).toBe("DENIED");
  });

  it("answers by its own rules without a key and writes the call to the journal", async () => {
    const aigul = actorByLogin("aigul");
    const res = await AI.softenText(db, aigul, { studentId: studentId("miras"), text: "Мирас опять мешал", lang: "ru" });
    expect(res.source).toBe("OFFLINE");
    expect(res.fallback).toBe("NO_KEY");
    expect(res.data.options).toEqual(["Мирас сегодня отвлекал(а)"]);
    const j = await AI.aiJournal(db, actorByLogin("admin"));
    expect(j.keySet).toBe(false);
    expect(j.totals).toMatchObject({ calls: 1, gemini: 0, offline: 1, aboutChild: 1 });
    expect(j.rows[0].call.feature).toBe("SOFTEN");
    await expect(AI.aiJournal(db, aigul)).rejects.toThrow();
  });

  it("sends Gemini no names, keeps the key in a header and puts the names back", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    const sent = fakeGemini({ options: ["У [имя] сегодня было трудно усидеть, [ученик 2] помогла."], serious: false });
    const res = await AI.softenText(db, actorByLogin("aigul"), { studentId: studentId("miras"), text: "Мирас опять сорвал урок, Алия его успокоила", lang: "ru" });
    expect(res.source).toBe("GEMINI");
    expect(res.data.options).toEqual(["У Мирас сегодня было трудно усидеть, Алия помогла."]);
    expect(sent).toHaveLength(1);
    expect(sent[0].url).toContain(":generateContent");
    expect(sent[0].url).not.toContain("test-key");
    expect(sent[0].headers["x-goog-api-key"]).toBe("test-key");
    expect(sent[0].body).not.toMatch(/Мирас|Алия|Сейіт|Қасым/);
    expect(sent[0].body).toContain("[имя]");
    const body = JSON.parse(sent[0].body);
    expect(body.generationConfig.responseMimeType).toBe("application/json");
    const j = await AI.aiJournal(db, actorByLogin("admin"));
    expect(j.rows[0].call).toMatchObject({ source: "GEMINI", model: "gemini-test", inputTokens: 120, outputTokens: 40 });
  });

  it("turns goal numbers into the plan's goals and drops what was not said", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    fakeGemini({ transcript: "Мирас руку поднимал", marks: [{ goal: 2, value: "YES", quote: "руку поднимал" }, { goal: 1, value: "NONE", quote: "" }, { goal: 9, value: "NO", quote: "?" }], note: "[имя] поднимал руку." });
    const miras = studentId("miras");
    const res = await AI.voiceToMarks(db, actorByLogin("aigul"), { studentId: miras, date: S.today(), text: "Мирас руку поднимал", lang: "ru" });
    const plan = await S.planFor(db, miras, S.today());
    const school = plan!.goals.filter((g) => g.place === "SCHOOL");
    expect(res.data.marks).toEqual([{ goalId: school[1].id, value: "YES", quote: "руку поднимал" }]);
    expect(res.data.note).toBe("Мирас поднимал руку.");
  });

  it("falls back when the quota is used up or the answer has the wrong shape", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    fakeGemini({}, 429);
    const a = await AI.draftStory(db, actorByLogin("saule"), { studentId: studentId("miras"), situation: "замена учителя", lang: "ru" });
    expect([a.source, a.fallback]).toEqual(["OFFLINE", "QUOTA"]);
    expect(a.data.title).toBe("Замена учителя");
    fakeGemini({ steps: "not a list" });
    const b = await AI.photoToSteps(db, actorByLogin("gulnar"), { studentId: studentId("miras"), mime: "image/jpeg", data: Buffer.from("jpeg").toString("base64"), lang: "kk" });
    expect([b.source, b.fallback]).toEqual(["OFFLINE", "FAILED"]);
    expect(b.data.steps[0]).toBe(A.offlineSteps("kk").steps[0]);
  });

  it("writes Google's reason for a refusal to the server log, without the note", async () => {
    process.env.GEMINI_API_KEY = "bad-key";
    fakeGemini({}, 400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "API key not valid. Please pass a valid API key.", details: [{ reason: "API_KEY_INVALID" }] } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const res = await AI.softenText(db, actorByLogin("aigul"), { studentId: studentId("miras"), text: "Мирас опять мешал", lang: "ru" });
      expect([res.source, res.fallback]).toEqual(["OFFLINE", "FAILED"]);
      const line = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(line).toContain("SOFTEN HTTP 400 INVALID_ARGUMENT API_KEY_INVALID API key not valid");
      expect(line).not.toMatch(/Мирас|мешал|bad-key/);
    } finally {
      warn.mockRestore();
    }
  });

  it("checks files before sending them", async () => {
    const gulnar = actorByLogin("gulnar");
    await expect(AI.photoToSteps(db, gulnar, { studentId: studentId("miras"), mime: "application/pdf", data: "AAAA", lang: "ru" })).rejects.toThrow(S.UserError);
    const big = "A".repeat(Math.ceil((A.AI_IMAGE_MAX_BYTES + 10) / 3) * 4);
    await expect(AI.photoToSteps(db, gulnar, { studentId: studentId("miras"), mime: "image/jpeg", data: big, lang: "ru" })).rejects.toThrow(S.UserError);
  });
});
