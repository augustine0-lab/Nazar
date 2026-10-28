// "Living text": a long reading split into short chapters, each with its own picture, read one at a time.

export const SCENES = ["sea", "steppe", "mountains", "forest", "river", "sky", "desert", "winter", "night", "city"] as const;
export type Scene = (typeof SCENES)[number];
export const isScene = (v: string): v is Scene => (SCENES as readonly string[]).includes(v);

export interface Chapter {
  title: string;
  text: string;
  scene: Scene;
}

export const MAX_CHAPTERS = 8;
export const MAX_CHAPTER_TITLE = 60;
export const MAX_CHAPTER_TEXT = 700;
export const MAX_READING_TITLE = 80;

// Word beginnings, Russian and Kazakh, that hint at a picture. Some carry a look-ahead so that, for example,
// "гор" (mountain) does not catch "город" (town) and "қар" (snow) does not catch "қара" (black).
const HINTS: Record<Scene, string[]> = {
  sea: ["мор(?!ков|оз)", "океан", "волн", "остров", "плот", "корабл", "теңіз", "мұхит", "толқын", "арал", "кеме"],
  river: ["рек[аиеу](?![L])", "речк", "речн", "ручей", "ручь", "озер", "озёр", "өзен", "көл(?!ік|еңк)", "бұлақ"],
  mountains: ["гор(?!од)", "скал", "вершин", "ледник", "тау", "шың", "жарта", "мұздық"],
  forest: ["лес(?!т)", "дерев", "лист", "гриб", "белк", "орман", "ағаш", "жапырақ", "саңырауқұлақ", "тиін"],
  desert: ["пустын", "песок", "песк", "дюн", "бархан", "верблюд", "шөл", "құм", "түйе"],
  winter: ["зим", "снег", "снеж", "лёд", "льд", "мороз", "қыс(?!қ)", "қар(?![аы])", "мұз(?!дық)", "аяз"],
  night: ["ноч", "звёзд", "звезд", "лун", "космос", "планет", "ракет", "түн", "жұлдыз", "ғарыш", "зымыран"],
  city: ["город", "улиц", "дом(?!аш)", "школ", "завод", "қала(?!м)", "көше", "мектеп", "зауыт"],
  sky: ["облак", "облач", "туч", "дожд", "небо(?!л)", "неба", "небе", "ветер", "ветр", "бұлт", "жаңбыр", "аспан", "жел(?!т)"],
  steppe: ["степ(?!ен)", "поле", "полям", "трав", "конь", "коня", "кони", "лошад", "юрт", "табун", "дала", "шөп", "жылқы", "киіз", "ауыл", "жайлау"],
};
const LETTER = "a-zа-яёәғқңөұүһі";
const PATTERNS = Object.fromEntries(
  SCENES.map((s) => [s, HINTS[s].map((h) => new RegExp(`(?<![${LETTER}])${h.replace("[L]", `[${LETTER}]`)}`, "giu"))]),
) as Record<Scene, RegExp[]>;
// When nothing in the text hints at a picture, chapters still look different from each other.
const FALLBACK: Scene[] = ["steppe", "sky", "mountains", "forest", "sea", "river", "night", "city"];

/** Chooses a picture from the words of the chapter; the title counts twice. */
export function pickScene(title: string, text: string, index = 0): Scene {
  const score = (s: Scene, str: string) => PATTERNS[s].reduce((n, re) => n + (str.match(re)?.length ?? 0), 0);
  let best: Scene | null = null;
  let top = 0;
  for (const s of SCENES) {
    const n = score(s, title) * 2 + score(s, text);
    if (n > top) [best, top] = [s, n];
  }
  return best ?? FALLBACK[index % FALLBACK.length];
}

/**
 * Chapters are separated by an empty line. When a chapter has more than one line, the first line is its title.
 * Pictures are picked from the words; the teacher can change them afterwards.
 */
export function parseChapters(text: string): Chapter[] {
  return text
    .replace(/\r/g, "")
    .split(/\n\s*\n/)
    .map((block) => block.split("\n").map((l) => l.trim()).filter(Boolean))
    .filter((lines) => lines.length)
    .map((lines, i) => {
      const title = lines.length > 1 ? lines[0].replace(/^#+\s*/, "") : "";
      const body = (lines.length > 1 ? lines.slice(1) : lines).join(" ").replace(/\s+/g, " ");
      return { title, text: body, scene: pickScene(title, body, i) };
    });
}

export const chaptersToText = (chapters: Pick<Chapter, "title" | "text">[]) =>
  chapters.map((c) => (c.title ? `${c.title}\n${c.text}` : c.text)).join("\n\n");

/** Seconds to read a chapter at a calm pace for a primary pupil (about 75 words a minute). */
export function readingSeconds(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(60, Math.max(8, Math.round(words * 0.8)));
}

/** Sentences of a chapter, so the reader can follow one sentence at a time. */
export const sentences = (text: string) => text.split(/(?<=[.!?…])\s+/).filter(Boolean);
