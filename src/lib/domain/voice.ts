// The clock of a living text chapter: when each word is read. With a recording, the times come from the voice;
// without one, the words are spread over a calm reading pace, longer words taking longer.
import { readingSeconds, sentences } from "./reading";

/** A chapter voiced ahead of time (scripts/voice/make.py). words: start, end, start, end, ... in seconds. */
export interface Recording {
  src: string;
  hash: number;
  start: number;
  dur: number;
  words: number[];
}

export interface Word {
  text: string;
  start: number;
  end: number;
  /** Which sentence of the chapter it belongs to. */
  sentence: number;
}

export interface Timeline {
  dur: number;
  words: Word[];
  /** Index of the first word of each sentence. */
  firsts: number[];
  /** The recording to play, when the chapter has one. */
  src?: string;
}

export const SPEEDS = [0.75, 1, 1.25] as const;
export type Speed = (typeof SPEEDS)[number];
export const isSpeed = (v: unknown): v is Speed => (SPEEDS as readonly unknown[]).includes(v);

/** FNV-1a over UTF-16 code units: tells whether a recording was made from exactly this text. */
export function textHash(text: string): number {
  let h = 0x811c9dc5;
  for (let k = 0; k < text.length; k++) {
    h ^= text.charCodeAt(k);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** The words of a chapter in reading order, sentence by sentence, as they are shown. */
export function tokens(text: string): { text: string; sentence: number }[] {
  return sentences(text).flatMap((s, k) => s.split(/\s+/).filter(Boolean).map((w) => ({ text: w, sentence: k })));
}

function build(words: Word[], dur: number, src?: string): Timeline {
  const firsts: number[] = [];
  words.forEach((w, k) => {
    if (firsts.length === w.sentence) firsts.push(k);
  });
  return { dur, words, firsts, src };
}

/** No recording: the chapter takes readingSeconds(), a short pause before each new sentence. */
export function silentTimeline(text: string): Timeline {
  const list = tokens(text);
  const dur = readingSeconds(text);
  const weight = list.map((w, k) => w.text.replace(/[^\p{L}\p{N}]/gu, "").length + 2 + (k > 0 && list[k - 1].sentence !== w.sentence ? 3 : 0));
  const total = weight.reduce((a, b) => a + b, 0) || 1;
  let acc = 0;
  const words = list.map((w, k) => {
    const start = (dur * acc) / total;
    acc += weight[k];
    return { ...w, start, end: (dur * acc) / total };
  });
  return build(words, dur);
}

/** What a recording is checked against: the chapter's title and its text. */
export const chapterHash = (title: string, text: string) => textHash(`${title}\n${text}`);

/** The recording's own times, or null when the title or the text changed since it was made. */
export function recordedTimeline(title: string, text: string, rec: Recording | undefined): Timeline | null {
  if (!rec || rec.hash !== chapterHash(title, text)) return null;
  const list = tokens(text);
  if (rec.words.length !== list.length * 2) return null;
  const words = list.map((w, k) => ({ ...w, start: rec.words[2 * k], end: rec.words[2 * k + 1] }));
  return build(words, rec.dur, rec.src);
}

/** The word being read at time t: -1 before the first word, the last one after the end. */
export function wordAt(tl: Timeline, t: number): number {
  let lo = 0;
  let hi = tl.words.length - 1;
  if (hi < 0 || t < tl.words[0].start) return -1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (tl.words[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** The time to jump to for "back one sentence" (dir -1) or "forward one sentence" (dir 1); null past the end. */
export function sentenceJump(tl: Timeline, t: number, dir: -1 | 1): number | null {
  const w = wordAt(tl, t);
  // Before the first word (the title is being read) the first sentence counts as the current one.
  const now = w < 0 ? 0 : tl.words[w].sentence;
  if (dir === 1) {
    const next = tl.firsts[now + 1];
    return next === undefined ? null : tl.words[next].start;
  }
  // Just after a sentence began, "back" goes to the one before; later on it starts this one again.
  const here = tl.words[tl.firsts[now]].start;
  if (t - here > 1.2 || now === 0) return now === 0 ? 0 : here;
  return tl.words[tl.firsts[now - 1]].start;
}

/** The same place in another timeline of the same text (switching the voice on or off). */
export function sameWord(from: Timeline, to: Timeline, t: number): number {
  const w = wordAt(from, t);
  if (w < 0) return 0;
  return to.words[Math.min(w, to.words.length - 1)]?.start ?? 0;
}
