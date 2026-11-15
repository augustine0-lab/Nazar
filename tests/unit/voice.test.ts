import { describe, expect, it } from "vitest";
import * as D from "@/lib/domain";
import { resolve, LANGS, type Lang } from "@/lib/i18n";
import { RECORDED } from "@/lib/voice/recorded";
import { recordingFor } from "@/lib/voice";

const text = "Жила-была капля. Солнце светило ярко! Капле стало жарко.";

describe("living text clock", () => {
  it("spreads the words of a chapter over a calm pace, sentence by sentence", () => {
    const tl = D.silentTimeline(text);
    expect(tl.dur).toBe(D.readingSeconds(text));
    expect(tl.words.map((w) => w.text)).toEqual(["Жила-была", "капля.", "Солнце", "светило", "ярко!", "Капле", "стало", "жарко."]);
    expect(tl.firsts).toEqual([0, 2, 5]);
    expect(tl.words.at(-1)!.end).toBeCloseTo(tl.dur);
    for (let k = 1; k < tl.words.length; k++) expect(tl.words[k].start).toBeCloseTo(tl.words[k - 1].end);
  });

  it("finds the word being read and steps one sentence back or forward", () => {
    const tl = D.silentTimeline(text);
    expect(D.wordAt(tl, -1)).toBe(-1);
    expect(D.wordAt(tl, 0)).toBe(0);
    expect(D.wordAt(tl, tl.words[3].start + 0.01)).toBe(3);
    expect(D.wordAt(tl, tl.dur + 5)).toBe(7);

    const second = tl.words[2].start;
    const third = tl.words[5].start;
    expect(D.sentenceJump(tl, second + 0.1, 1)).toBe(third);
    expect(D.sentenceJump(tl, third + 0.1, 1)).toBeNull();
    // Just after a sentence began, back goes to the one before; later on it repeats this one.
    expect(D.sentenceJump(tl, second + 0.3, -1)).toBe(0);
    expect(D.sentenceJump(tl, tl.words[4].start + 0.1, -1)).toBe(second);
    expect(D.sentenceJump(tl, 0.5, -1)).toBe(0);
  });

  it("keeps the place when the voice is switched on or off", () => {
    const a = D.silentTimeline(text);
    const b = { ...a, words: a.words.map((w) => ({ ...w, start: w.start / 2, end: w.end / 2 })), dur: a.dur / 2 };
    expect(D.sameWord(a, b, a.words[4].start + 0.01)).toBe(b.words[4].start);
  });

  it("uses a recording only for the very text it was made from", () => {
    const words = D.tokens(text).flatMap((_, k) => [k, k + 0.5]);
    const rec: D.Recording = { src: "/voice/x.mp3", hash: D.chapterHash("Море", text), start: 0, dur: 9, words };
    expect(D.recordedTimeline("Море", text, rec)?.src).toBe("/voice/x.mp3");
    expect(D.recordedTimeline("Море", text + " Ещё.", rec)).toBeNull();
    expect(D.recordedTimeline("Небо", text, rec)).toBeNull();
    expect(D.recordedTimeline("Море", text, { ...rec, words: words.slice(2) })).toBeNull();
  });
});

describe("ready recordings of the demo text", () => {
  it("match every demo chapter in Russian and Kazakh, word for word", () => {
    const keys = Object.keys(RECORDED);
    expect(keys.length).toBeGreaterThanOrEqual(5);
    for (const key of keys)
      for (const lang of LANGS) {
        const rec = RECORDED[key][lang as Lang]!;
        const body = resolve(lang, `@${key}`);
        const title = resolve(lang, `@${key.replace(/\.text$/, ".title")}`);
        const tl = D.recordedTimeline(title, body, rec);
        expect(tl, `${lang} ${key}`).not.toBeNull();
        expect(tl!.words[0].start).toBeGreaterThanOrEqual(rec.start - 0.01);
        expect(tl!.words.at(-1)!.end).toBeLessThanOrEqual(rec.dur);
        for (let k = 1; k < tl!.words.length; k++) expect(tl!.words[k].start).toBeGreaterThanOrEqual(tl!.words[k - 1].start);
      }
  });

  it("are found by the demo key, or by the same words after the teacher saved the text unchanged", () => {
    const key = Object.keys(RECORDED)[0];
    const title = resolve("kk", `@${key.replace(/\.text$/, ".title")}`);
    const body = resolve("kk", `@${key}`);
    expect(recordingFor(`@${key}`, title, body, "kk")).toBe(RECORDED[key].kk);
    expect(recordingFor(body, title, body, "kk")).toBe(RECORDED[key].kk);
    expect(recordingFor(body + " Жаңа сөйлем.", title, body + " Жаңа сөйлем.", "kk")).toBeUndefined();
  });
});

describe("stepping while the title is read", () => {
  it("goes forward to the second sentence, not the first", () => {
    const tl = D.silentTimeline(text);
    const late = { ...tl, words: tl.words.map((w) => ({ ...w, start: w.start + 2, end: w.end + 2 })), dur: tl.dur + 2 };
    expect(D.sentenceJump(late, 0.5, 1)).toBe(late.words[2].start);
    expect(D.sentenceJump(late, 0.5, -1)).toBe(0);
  });
});
