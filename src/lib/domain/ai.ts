// AI help through Gemini, the pure rules: what may go out (the child's name never does), what may come back
// (answers are checked against a fixed shape), and Nazar's own simple answers for when Gemini is not there.
import { z } from "zod";

type Lang = "ru" | "kk";

export const AI_NAME_MARK = "[имя]";
export const AI_TEXT_MAX = 1000;
export const AI_SITUATION_MAX = 200;
/** Limits of what the browser may send; the browser shrinks photos before sending. */
export const AI_IMAGE_MAX_BYTES = 4_000_000;
export const AI_AUDIO_MAX_BYTES = 2_000_000;
export const AI_AUDIO_SECONDS = 30;
export const AI_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const AI_AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/aac"] as const;

/** Bytes behind a base64 string, without decoding it. */
export const base64Bytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);
/** "audio/webm;codecs=opus" → "audio/webm". */
export const baseMime = (mime: string) => mime.split(";")[0].trim().toLowerCase();

/* ---------- the child's name stays at school ---------- */

/** The parts of a name worth hiding: the full name and each part of three letters or more. */
export function nameParts(displayName: string): string[] {
  const parts = displayName.split(/\s+/).map((p) => p.trim()).filter((p) => [...p].length >= 3);
  return [...new Set(parts)];
}

const escapeRx = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Replaces every form of a name with a mark: "Мирас", "Мирасу", "Мирастың", "Сейітов" all become the mark.
 * A name part is followed by at most four more letters, which covers Russian and Kazakh endings.
 */
export function hideNames(text: string, names: string[], mark = AI_NAME_MARK): string {
  let out = text;
  // Longer parts first, so "Сейітова" is not cut by "Сейіт".
  for (const n of names.flatMap(nameParts).sort((a, b) => b.length - a.length)) {
    const rx = new RegExp(`(?<![\\p{L}])${escapeRx(n)}\\p{L}{0,4}(?![\\p{L}])`, "giu");
    out = out.replace(rx, mark);
  }
  return out;
}

/**
 * Hides the child (as [имя]) and classmates (as [ученик 2], [ученик 3] ...) before a text leaves the school,
 * and gives back a function that puts first names back into the answer.
 */
export function pseudonymize(text: string, child: string, classmates: string[] = []) {
  const others = classmates.filter((c) => c !== child);
  let out = text;
  others.forEach((c, i) => (out = hideNames(out, [c], `[ученик ${i + 2}]`)));
  out = hideNames(out, [child]);
  const first = (n: string) => n.split(/\s+/)[0];
  const restore = (answer: string) => {
    let r = answer.split(AI_NAME_MARK).join(first(child));
    others.forEach((c, i) => (r = r.split(`[ученик ${i + 2}]`).join(first(c))));
    return r;
  };
  return { text: out, restore };
}

/* ---------- answers Gemini must give, in Nazar's own shapes ---------- */

export const stepsOut = z.object({
  subject: z.string().max(60),
  title: z.string().max(120),
  steps: z.array(z.string().min(1).max(160)).min(2).max(8),
  estMinutes: z.number().int().min(5).max(180),
});
export type StepsOut = z.infer<typeof stepsOut>;

export const AI_MARK_VALUES = ["YES", "NO", "NONE"] as const;
export const marksOut = z.object({
  transcript: z.string().max(2000),
  marks: z.array(z.object({ goal: z.number().int().min(1).max(99), value: z.enum(AI_MARK_VALUES), quote: z.string().max(200) })).max(8),
  note: z.string().max(400),
});
export type MarksOut = z.infer<typeof marksOut>;

export const softenOut = z.object({
  options: z.array(z.string().min(1).max(AI_TEXT_MAX)).min(1).max(3),
  // A record about safety (injury, violence, threat) is not softened: it goes to the psychologist as it is.
  serious: z.boolean(),
});
export type SoftenOut = z.infer<typeof softenOut>;

/** Pictures a story step may use: all of them are drawn by Nazar's own emoji set. */
export const STORY_ICONS = [
  "📅", "🏫", "📚", "📖", "🎒", "🚗", "🚶", "⏰", "⏳", "👩‍🏫", "🧑‍⚕️", "🙂", "😊", "😟", "😐", "😮‍💨",
  "🙋", "✋", "🤝", "👍", "👏", "💪", "⭐", "✅", "💬", "🗣️", "🎧", "🔊", "🍽️", "💧", "🧩", "🪑", "👀",
] as const;

export const storyOut = z.object({
  title: z.string().min(1).max(60),
  steps: z.array(z.object({ icon: z.string().max(16), text: z.string().min(1).max(140) })).min(3).max(7),
});
export type StoryOut = z.infer<typeof storyOut>;

/** A step with a picture outside the set gets the plain arrow, so every story still draws. */
export const fixStoryIcons = (s: StoryOut): StoryOut => ({
  ...s,
  steps: s.steps.map((st) => ({ ...st, icon: (STORY_ICONS as readonly string[]).includes(st.icon) ? st.icon : "➡️" })),
});

/** Story steps in the editor's text form: "🙂 | Text", one per line. */
export const storyToLines = (s: StoryOut) => s.steps.map((st) => `${st.icon} | ${st.text}`).join("\n");

// JSON schemas for Gemini's structured output (the OpenAPI subset the API accepts).
const str = { type: "string" };
export const GEMINI_SCHEMAS = {
  steps: {
    type: "object",
    properties: { subject: str, title: str, steps: { type: "array", items: str, minItems: 2, maxItems: 8 }, estMinutes: { type: "integer", minimum: 5, maximum: 180 } },
    required: ["subject", "title", "steps", "estMinutes"],
  },
  marks: {
    type: "object",
    properties: {
      transcript: str,
      marks: {
        type: "array",
        items: { type: "object", properties: { goal: { type: "integer" }, value: { type: "string", enum: [...AI_MARK_VALUES] }, quote: str }, required: ["goal", "value", "quote"] },
      },
      note: str,
    },
    required: ["transcript", "marks", "note"],
  },
  soften: {
    type: "object",
    properties: { options: { type: "array", items: str, minItems: 1, maxItems: 3 }, serious: { type: "boolean" } },
    required: ["options", "serious"],
  },
  story: {
    type: "object",
    properties: {
      title: str,
      steps: {
        type: "array",
        minItems: 3,
        maxItems: 7,
        items: { type: "object", properties: { icon: { type: "string", enum: [...STORY_ICONS] }, text: str }, required: ["icon", "text"] },
      },
    },
    required: ["title", "steps"],
  },
} as const;

/* ---------- what Nazar tells Gemini ---------- */

const LANG_NAME: Record<Lang, string> = { ru: "русском", kk: "казахском" };

export function systemPrompt(lang: Lang): string {
  return [
    "Ты помощник школьной платформы Nazar, которая поддерживает младших школьников с трудностями внимания (СДВГ).",
    "Тебе пишут только взрослые: учитель, родитель или школьный психолог. Ребёнок с тобой не общается.",
    "Никогда не ставь диагнозов, не советуй лекарства и не оценивай личность ребёнка. Описывай поведение и ситуацию, а не характер.",
    `Имя ребёнка скрыто как ${AI_NAME_MARK}, имена других детей как [ученик 2], [ученик 3]. Не угадывай имена и оставляй метки как есть.`,
    "Пиши просто, коротко и доброжелательно, без ярлыков.",
    `Отвечай на ${LANG_NAME[lang]} языке, строго в формате JSON по заданной схеме.`,
  ].join("\n");
}

export const photoPrompt = (lang: Lang) =>
  [
    "На фото задание из учебника, тетради или дневника младшего школьника.",
    "Определи предмет и коротко назови задание (например «Упр. 87, с. 42»).",
    "Разбей его на 3–6 маленьких шагов для ребёнка с СДВГ. Первый шаг совсем простой, чтобы легко начать (открыть учебник, найти упражнение).",
    "Каждый шаг одно короткое действие. Не решай задание и не пиши ответы.",
    "Оцени, сколько минут займёт всё задание у третьеклассника (число от 5 до 180).",
    `Ответ на ${LANG_NAME[lang]} языке. Если на фото нет задания, верни steps с советом сфотографировать задание крупнее.`,
  ].join("\n");

export const marksPrompt = (lang: Lang, goals: string[], hasAudio: boolean) =>
  [
    hasAudio ? "Во вложении короткая голосовая заметка учителя после урока." : "Ниже короткая заметка учителя после урока.",
    "Цели ребёнка на уроке (номер: формулировка):",
    ...goals.map((g, i) => `${i + 1}: ${g}`),
    hasAudio ? "Сначала дословно запиши, что сказал учитель (transcript)." : "В transcript повтори заметку.",
    "Для каждой цели, о которой есть сведения в заметке, верни value YES (цель выполнена) или NO (не выполнена) и короткую цитату из заметки (quote).",
    "Если о цели ничего не сказано, верни value NONE. Не придумывай то, чего нет в заметке.",
    `В note дай нейтральную заметку для дневника: одно-два предложения на ${LANG_NAME[lang]}, без ярлыков, сначала то, что получилось.`,
  ].join("\n");

export const softenPrompt = (lang: Lang, text: string) =>
  [
    "Взрослый пишет о ребёнке заметку или сообщение родителю. Предложи 1–3 варианта той же мысли более мягко и нейтрально:",
    "опиши конкретное поведение и ситуацию вместо оценки ребёнка, сохрани все факты, не преуменьшай их, по возможности начни с того, что получилось.",
    "Не добавляй фактов, которых нет в тексте. Каждый вариант не длиннее исходного больше чем в полтора раза.",
    "Если в тексте есть угроза безопасности (травма, насилие, жестокое обращение, опасность для жизни), верни serious: true и исходный текст как единственный вариант.",
    `Варианты на ${LANG_NAME[lang]} языке.`,
    "Текст:",
    text,
  ].join("\n");

export const storyPrompt = (lang: Lang, situation: string) =>
  [
    "Напиши социальную историю в духе Кэрол Грей для ребёнка 7–10 лет с СДВГ о ситуации ниже.",
    "От первого лица, 4–6 коротких шагов: что будет происходить, что могут чувствовать и делать другие люди, что я могу сделать, чем всё закончится.",
    "Описательных предложений больше, чем подсказок. Без запретов, угроз и стыда. Каждый шаг одно-два простых предложения.",
    "Для каждого шага выбери подходящую картинку из разрешённого списка. Название короткое, до 40 знаков.",
    `История на ${LANG_NAME[lang]} языке.`,
    "Ситуация:",
    situation,
  ].join("\n");

/* ---------- Nazar's own answers when Gemini is not there ---------- */

const TEMPLATE_STEPS: Record<Lang, string[]> = {
  ru: ["Положи перед собой учебник и тетрадь", "Найди задание и прочитай его вслух", "Сделай первую строчку или первый пример", "Сделай остальное по одному", "Проверь и отметь «готово»"],
  kk: ["Алдыңа оқулық пен дәптерді қой", "Тапсырманы тауып, дауыстап оқы", "Бірінші жолды немесе бірінші мысалды жаса", "Қалғанын бір-бірден жаса", "Тексеріп, «дайын» деп белгіле"],
};

/** Without Gemini the photo cannot be read: the adult gets a ready frame of steps to fill in. */
export const offlineSteps = (lang: Lang): StepsOut => ({ subject: "", title: "", steps: TEMPLATE_STEPS[lang], estMinutes: 20 });

// Harsh words and their calmer description; a small list, enough to show the idea without the AI.
const SOFTER: Record<Lang, [RegExp, string][]> = {
  ru: [
    [/сорвал(а)? урок/giu, "на уроке было трудно усидеть"],
    [/плохо (себя )?вёл(а)?( себя)?|плохо (себя )?вел(а)?( себя)?/giu, "было трудно соблюдать правила"],
    [/не слушается|не слушал(ся|а|ась)?/giu, "не сразу услышал(а) инструкцию"],
    [/ленит(ся)?|ленив(ый|ая)/giu, "было трудно начать"],
    [/невнимательн(ый|ая|о)/giu, "было трудно удержать внимание"],
    [/хулиган(ит|ил|ка)?/giu, "было трудно сдержаться"],
    [/грубил(а)?|нахамил(а)?/giu, "ответил(а) резко"],
    [/кричал(а)?|орал(а)?/giu, "говорил(а) громко"],
    // «Мешал соседям» becomes «отвлекал(а) соседей»: the dative after «мешал» does not fit «отвлекал».
    [/(?<![\p{L}])мешал(а)?\s+(соседям|соседу|другим|ребятам|классу)(?![\p{L}])/giu, "отвлекал(а) соседей"],
    [/(?<![\p{L}])мешал(а)?(?![\p{L}])/giu, "отвлекал(а)"],
    [/(?<![\p{L}])(опять|снова)(?![\p{L}])/giu, "сегодня"],
    [/(?<![\p{L}])(постоянно|всегда|вечно)(?![\p{L}])/giu, "несколько раз"],
    [/(?<![\p{L}])(ужасно|отвратительно|безобразно)(?![\p{L}])/giu, "трудно"],
  ],
  kk: [
    [/(?<![\p{L}])тағы да(?![\p{L}])/giu, "бүгін"],
    [/(?<![\p{L}])(үнемі|әрдайым)(?![\p{L}])/giu, "бірнеше рет"],
    [/жалқау(лық)?/giu, "бастау қиын болды"],
    [/тәртіпсіз/giu, "ережені сақтау қиын болды"],
    [/тыңдамайды|тыңдамады/giu, "нұсқауды бірден естімеді"],
    [/айғайлады|бақырды/giu, "қатты сөйледі"],
    [/(?<![\p{L}])өте нашар(?![\p{L}])/giu, "қиын"],
  ],
};

/** Keeps a capital letter where the replaced word had one (start of a sentence). */
const sameCase = (found: string, to: string) => (found[0] && found[0] !== found[0].toLowerCase() ? to.charAt(0).toUpperCase() + to.slice(1) : to);

export function offlineSoften(lang: Lang, text: string): SoftenOut {
  let out = text;
  // A Kazakh note may still be written in Russian, so both lists apply to it.
  const lists = lang === "kk" ? [SOFTER.kk, SOFTER.ru] : [SOFTER.ru];
  for (const list of lists) for (const [rx, to] of list) out = out.replace(rx, (m) => sameCase(m, to));
  out = out.replace(/!{2,}/g, ".").replace(/!/g, ".");
  return { options: [out], serious: false };
}

/** Words that tie a sentence to a goal even when the goal says it differently. */
const THEMES: string[][] = [
  ["рук", "выкри", "крич", "айғ", "қол", "көте"],
  ["мест", "сиде", "сидел", "встав", "вскак", "ходил", "орны", "отыр"],
  ["нача", "начи", "прист", "тетра", "задан", "баст", "тапс"],
  ["запи", "днев", "домаш", "жаз"],
  ["инстр", "перв", "услыш", "слуш", "нұсқ", "тыңд"],
  ["пар", "сосе", "конф", "ссор", "дра", "жұп", "жанж"],
  ["порт", "рюкз", "собр", "жина"],
];
const NEGATIVE = /(?<![\p{L}])(не|нет|ни)(?![\p{L}])|отвлек|вскак|встава|выкрик|крич|мешал|забыл|ссор|дрался|перебив|жоқ|емес|ұмыт|айғай|алаң|тұрып кетті|\p{L}(ма|ме|ба|бе|па|пе)(ды|ді)(?![\p{L}])/iu;

// Five letters of a word, so "конца" does not catch "концерт" and "задание" still catches "задания".
const stemsOf = (text: string) => [...new Set((text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).map((w) => w.slice(0, 5)))];

/**
 * The teacher's note without the AI: each sentence that talks about a goal marks it, a sentence with
 * "не", "забыл", "вставал" and the like marks it as not done. A plain rule, only good enough to show the idea.
 */
export function offlineMarks(text: string, goals: string[]): MarksOut {
  const sentences = text.split(/[.!?;\n]+|,\s*(?=(?:но|а|однако|бірақ)(?![\p{L}]))/iu).map((s) => s.trim()).filter(Boolean);
  const marks: MarksOut["marks"] = [];
  goals.forEach((g, i) => {
    const goalLow = g.toLowerCase();
    const keys = new Set(stemsOf(g));
    for (const theme of THEMES) if (theme.some((k) => goalLow.includes(k))) theme.forEach((k) => keys.add(k));
    const hit = sentences.find((s) => {
      const low = s.toLowerCase();
      return [...keys].some((k) => low.includes(k));
    });
    if (hit) marks.push({ goal: i + 1, value: NEGATIVE.test(hit) ? "NO" : "YES", quote: hit.slice(0, 200) });
  });
  return { transcript: text, marks, note: text.trim().slice(0, 400) };
}

const TEMPLATE_STORY: Record<Lang, (situation: string) => { icon: string; text: string }[]> = {
  ru: (s) => [
    { icon: "📅", text: `Скоро будет вот что: ${s}.` },
    { icon: "🙂", text: "Так бывает у многих ребят. Немного волноваться — это нормально." },
    { icon: "👩‍🏫", text: "Рядом будут взрослые, они знают, что делать, и помогут мне." },
    { icon: "😮‍💨", text: "Если станет трудно, я сделаю три медленных вдоха." },
    { icon: "🙋", text: "Я могу поднять руку и попросить помощи." },
    { icon: "⭐", text: "Потом всё закончится, и я смогу собой гордиться." },
  ],
  kk: (s) => [
    { icon: "📅", text: `Жақында мынадай болады: ${s}.` },
    { icon: "🙂", text: "Бұл көп балада болады. Сәл толқу қалыпты нәрсе." },
    { icon: "👩‍🏫", text: "Қасымда үлкендер болады, олар не істеу керегін біледі және көмектеседі." },
    { icon: "😮‍💨", text: "Қиын болса, үш рет баяу дем аламын." },
    { icon: "🙋", text: "Қолымды көтеріп, көмек сұрай аламын." },
    { icon: "⭐", text: "Кейін бәрі аяқталады, мен өзіммен мақтана аламын." },
  ],
};

export function offlineStory(lang: Lang, situation: string): StoryOut {
  const s = situation.trim().replace(/[.!?]+$/, "");
  const title = (s.charAt(0).toUpperCase() + s.slice(1)).slice(0, 60);
  return { title, steps: TEMPLATE_STORY[lang](s.charAt(0).toLowerCase() + s.slice(1)) };
}

/** Why Nazar answered by itself instead of Gemini. */
export const AI_FALLBACKS = ["NO_KEY", "QUOTA", "FAILED"] as const;
export type AiFallback = (typeof AI_FALLBACKS)[number];
