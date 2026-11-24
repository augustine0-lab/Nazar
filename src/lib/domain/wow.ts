// Sixth batch: «Надуй шарик», «Чистый стол», «Каракули», «Инструкция, которая не улетает», «Светофор тишины»,
// «Моя четверть в сторис» and «Карта трудных минут». Pure rules only: the microphone, the camera and the
// database are handled by the components and services that call these.

/* ---------- the microphone ---------- */

/** Loudness of one frame of samples (-1..1): the root mean square, 0..1. */
export function rms(samples: ArrayLike<number>): number {
  if (!samples.length) return 0;
  let sum = 0;
  for (let k = 0; k < samples.length; k++) sum += samples[k] * samples[k];
  return Math.sqrt(sum / samples.length);
}

/** The quiet of the room, taken from the first frames: the median, so one knock does not spoil it. */
export function noiseFloor(levels: readonly number[]): number {
  if (!levels.length) return 0;
  const s = [...levels].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/**
 * How hard the child blows, 0..1, from the frame's loudness and the room's quiet. Blowing into a microphone
 * is loud broadband noise close to it, far above the room; `BLOW_SPAN` above the floor counts as full.
 */
export const BLOW_SPAN = 0.2;
export function blowLevel(level: number, floor: number): number {
  return Math.max(0, Math.min(1, (level - floor * 1.5) / BLOW_SPAN));
}

/** Loudness as a 0..100 scale for the class meter: -60 dBFS (a silent room) is 0, -10 dBFS (shouting) is 100. */
export function loudnessPct(level: number): number {
  if (level <= 0) return 0;
  const db = 20 * Math.log10(level);
  return Math.max(0, Math.min(100, Math.round(((db + 60) / 50) * 100)));
}

/** Smooths a jumpy meter: rises fast, falls slowly, like a VU meter. */
export function smoothMeter(prev: number, next: number, dtMs: number): number {
  const tau = next > prev ? 120 : 600;
  const a = 1 - Math.exp(-Math.max(0, dtMs) / tau);
  return prev + (next - prev) * a;
}

/* ---------- «Надуй шарик» ---------- */

/** Five long, even breaths out fill the balloon. */
export const BREATHS_GOAL = 5;
/** A breath out counts from this long. A short puff only wobbles the balloon. */
export const BREATH_LONG_MS = 2500;
/** Below this the child is not blowing; above `BREATH_ON` the breath starts. Two levels so it does not flicker. */
export const BREATH_ON = 0.18;
export const BREATH_OFF = 0.1;
/** Above this the child is blowing too hard: the balloon waits until the breath is gentle again. */
export const BREATH_STRONG = 0.85;
/** A blow shorter than this is a knock or a word, not a breath, and is ignored. */
export const BREATH_NOISE_MS = 300;

export interface BreathState {
  phase: "rest" | "blow";
  /** Gentle blowing in this breath so far. */
  ms: number;
  /** Too-hard blowing in this breath so far. */
  strongMs: number;
  breaths: number;
  warnedStrong: boolean;
}
export const BREATH_START: BreathState = { phase: "rest", ms: 0, strongMs: 0, breaths: 0, warnedStrong: false };
export type BreathEvent = "breath" | "short" | "strong" | "done" | null;

/** One frame of `dtMs` with blowing `level` (0..1): the new state, and what just happened. */
export function breathStep(s: BreathState, level: number, dtMs: number): { state: BreathState; event: BreathEvent } {
  if (s.breaths >= BREATHS_GOAL) return { state: s, event: null };
  if (s.phase === "rest") {
    if (level >= BREATH_ON) return { state: { ...s, phase: "blow", ms: 0, strongMs: 0, warnedStrong: false }, event: null };
    return { state: s, event: null };
  }
  if (level < BREATH_OFF) {
    const rest = { ...s, phase: "rest" as const, ms: 0, strongMs: 0, warnedStrong: false };
    if (s.ms >= BREATH_LONG_MS) {
      const breaths = s.breaths + 1;
      return { state: { ...rest, breaths }, event: breaths >= BREATHS_GOAL ? "done" : "breath" };
    }
    return { state: rest, event: s.ms + s.strongMs >= BREATH_NOISE_MS ? "short" : null };
  }
  if (level >= BREATH_STRONG) {
    const strongMs = s.strongMs + dtMs;
    const warn = !s.warnedStrong && strongMs >= 400;
    return { state: { ...s, strongMs, warnedStrong: s.warnedStrong || warn }, event: warn ? "strong" : null };
  }
  return { state: { ...s, ms: s.ms + dtMs }, event: null };
}

/** How full the balloon is, 0..1: the breaths so far and the part of the breath going on now. */
export function balloonFill(s: BreathState): number {
  const now = s.phase === "blow" ? Math.min(1, s.ms / BREATH_LONG_MS) : 0;
  return Math.min(1, (s.breaths + now) / BREATHS_GOAL);
}

/* ---------- «Светофор тишины» ---------- */

export type QuietLight = "green" | "yellow" | "red";
/** Work minutes the teacher can pick for the class tree. */
export const QUIET_GOALS = [3, 5, 10] as const;
/** The tree waits only after this much noise in a row: one dropped pencil case does not stop it. */
export const QUIET_GRACE_MS = 1500;

export interface QuietState {
  quietMs: number;
  /** Noise in a row now. */
  loudMs: number;
  light: QuietLight;
}
export const QUIET_START: QuietState = { quietMs: 0, loudMs: 0, light: "green" };

/**
 * One frame of the class meter (0..100) against the teacher's limit. Below 80 % of the limit is a working
 * whisper (green), up to the limit is getting louder (yellow); both grow the tree. Above it is red: after a
 * short grace the tree waits. Noise never takes growth away, the tree only pauses.
 */
export function quietStep(s: QuietState, loud: number, limit: number, dtMs: number): QuietState {
  if (loud > limit) {
    const loudMs = s.loudMs + dtMs;
    return { quietMs: loudMs < QUIET_GRACE_MS ? s.quietMs + dtMs : s.quietMs, loudMs, light: loudMs < QUIET_GRACE_MS ? "yellow" : "red" };
  }
  return { quietMs: s.quietMs + dtMs, loudMs: 0, light: loud > limit * 0.8 ? "yellow" : "green" };
}

/** What has grown on the tree for this share of the goal: 0 a seed … 5 in blossom. */
export const TREE_STAGES = 5;
export function treeStage(quietMs: number, goalMin: number): number {
  const share = goalMin > 0 ? quietMs / (goalMin * 60_000) : 0;
  return Math.max(0, Math.min(TREE_STAGES, Math.floor(share * TREE_STAGES)));
}

/* ---------- «Чистый стол» ---------- */

/** COCO things that pull a child away from homework, and the picture for each. */
export const DESK_DISTRACTORS = {
  "cell phone": "📱",
  remote: "🎮",
  "teddy bear": "🧸",
  "sports ball": "⚽",
  frisbee: "🥏",
  banana: "🍌",
  apple: "🍎",
  orange: "🍊",
  sandwich: "🥪",
  donut: "🍩",
  cake: "🍰",
  pizza: "🍕",
  "hot dog": "🌭",
} as const;
export type DeskThing = keyof typeof DESK_DISTRACTORS;
export const DESK_THINGS = Object.keys(DESK_DISTRACTORS) as DeskThing[];
/** Things that belong on the desk: shown with a green frame, they never stop the check. */
export const DESK_GOOD = ["book", "scissors", "cup", "bottle"] as const;

/** A distractor counts as on the desk after this many frames in a row. */
export const DESK_SEEN_FRAMES = 3;
/** It counts as taken away when it has not been seen this long. */
export const DESK_GONE_MS = 1000;
/** The camera looks at least this long before it can say the desk is clear. */
export const DESK_WARMUP_MS = 2000;
/** And the desk must stay clear this long in a row. */
export const DESK_CLEAR_MS = 2000;

export interface DeskState {
  startedAt: number;
  streak: Partial<Record<DeskThing, number>>;
  lastSeen: Partial<Record<DeskThing, number>>;
  /** Since when nothing distracting is on the desk; null while something is. */
  clearSince: number | null;
}
export const deskStart = (t: number): DeskState => ({ startedAt: t, streak: {}, lastSeen: {}, clearSince: t });

/** One camera frame at `t` with the distractors seen in it: what is on the desk now, and whether it is clear. */
export function deskStep(s: DeskState, seen: ReadonlySet<string>, t: number): { state: DeskState; onDesk: DeskThing[]; clear: boolean } {
  const streak: DeskState["streak"] = {};
  const lastSeen: DeskState["lastSeen"] = { ...s.lastSeen };
  const onDesk: DeskThing[] = [];
  for (const thing of DESK_THINGS) {
    if (seen.has(thing)) {
      streak[thing] = (s.streak[thing] ?? 0) + 1;
      if (streak[thing]! >= DESK_SEEN_FRAMES) lastSeen[thing] = t;
    }
    const last = lastSeen[thing];
    if (last !== undefined && t - last < DESK_GONE_MS) onDesk.push(thing);
  }
  const clearSince = onDesk.length ? null : (s.clearSince ?? t);
  const clear = clearSince !== null && t - s.startedAt >= DESK_WARMUP_MS && t - clearSince >= DESK_CLEAR_MS;
  return { state: { startedAt: s.startedAt, streak, lastSeen, clearSince }, onDesk, clear };
}

/* ---------- «Инструкция, которая не улетает» ---------- */

/** At most this many points stay on the board: an instruction longer than that is not one instruction. */
export const MAX_PINNED = 6;
export const MAX_PIN_CHARS = 140;

/** A spoken phrase as a point on the board: trimmed, capital first letter, no filler at the ends. */
export function cleanPhrase(text: string): string {
  let s = text.replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:так|итак|ну|вот|значит|короче|ал|ендеше|жарайды|сонымен)[,\s]+/iu, "").trim();
  s = s.replace(/[\s,.…]+$/u, "");
  if (s.length > MAX_PIN_CHARS) s = s.slice(0, MAX_PIN_CHARS).replace(/\s+\S*$/u, "") + "…";
  return s ? s[0].toLocaleUpperCase("ru") + s.slice(1) : "";
}

export interface Pinned {
  text: string;
  done: boolean;
}

/** Adds a point to the board's list: an empty phrase or the same point again changes nothing; the oldest goes when full. */
export function pinInstruction(list: readonly Pinned[], text: string): Pinned[] {
  const clean = cleanPhrase(text);
  if (!clean) return [...list];
  if (list.some((p) => p.text.toLocaleLowerCase("ru") === clean.toLocaleLowerCase("ru"))) return [...list];
  return [...list, { text: clean, done: false }].slice(-MAX_PINNED);
}

/* ---------- «Моя четверть в сторис» ---------- */

/**
 * School quarters in Kazakhstan, by month and day (the exact holidays change every year by order of the
 * ministry, so these are the usual bounds): 1st Sep 1 – Oct 31, 2nd Nov 1 – Dec 31, 3rd Jan 1 – Mar 24,
 * 4th Mar 25 – May 31. Summer belongs to the 4th quarter that has just ended.
 */
export function quarterOf(date: string): { n: 1 | 2 | 3 | 4; from: string } {
  const y = Number(date.slice(0, 4));
  const md = date.slice(5);
  if (md >= "09-01" && md <= "10-31") return { n: 1, from: `${y}-09-01` };
  if (md >= "11-01") return { n: 2, from: `${y}-11-01` };
  if (md < "03-25") return { n: 3, from: `${y}-01-01` };
  return { n: 4, from: `${y}-03-25` };
}

/** Shorter than this, a quarter has too little to tell: the stories then show the last four weeks. */
export const RECAP_MIN_DAYS = 21;
export const RECAP_FALLBACK_DAYS = 28;

export function recapPeriod(today: string): { kind: "quarter"; n: number; from: string; to: string } | { kind: "weeks"; from: string; to: string } {
  const q = quarterOf(today);
  const days = Math.round((Date.parse(today) - Date.parse(q.from)) / 86_400_000);
  if (days >= RECAP_MIN_DAYS) return { kind: "quarter", n: q.n, from: q.from, to: today };
  const from = new Date(Date.parse(today) - RECAP_FALLBACK_DAYS * 86_400_000).toISOString().slice(0, 10);
  return { kind: "weeks", from, to: today };
}

/** The longest run of successful school days in a row, from per-day tallies in date order. */
export function longestStreak(days: readonly { ratio: number | null }[], thresholdPct: number): number {
  let best = 0, run = 0;
  for (const d of days) {
    if (d.ratio === null) continue; // a day with no marks neither breaks nor extends the run
    run = d.ratio * 100 >= thresholdPct ? run + 1 : 0;
    best = Math.max(best, run);
  }
  return best;
}

/** The weekday (1 = Monday … 5) with the best share of YES, among weekdays with at least `min` rated marks. */
export function bestWeekday(marks: readonly { date: string; value: string }[], weekdayOf: (d: string) => number, min = 6): number | null {
  const by = new Map<number, { yes: number; rated: number }>();
  for (const m of marks) {
    if (m.value !== "YES" && m.value !== "NO") continue;
    const w = weekdayOf(m.date);
    const x = by.get(w) ?? { yes: 0, rated: 0 };
    x.rated++;
    if (m.value === "YES") x.yes++;
    by.set(w, x);
  }
  let best: number | null = null, ratio = -1;
  for (const [w, x] of [...by].sort((a, b) => a[0] - b[0])) {
    if (x.rated < min) continue;
    if (x.yes / x.rated > ratio) {
      ratio = x.yes / x.rated;
      best = w;
    }
  }
  return best;
}

/** The goal that grew most from the first rated week to the last; only real growth counts. */
export function topGrowth<G>(goals: readonly G[], weeks: readonly { ratios: (number | null)[] }[]): { goal: G; from: number; to: number } | null {
  let best: { goal: G; from: number; to: number } | null = null;
  goals.forEach((goal, i) => {
    const rated = weeks.map((w) => w.ratios[i]).filter((r): r is number => r !== null);
    if (rated.length < 2) return;
    const from = rated[0], to = rated[rated.length - 1];
    if (to - from >= 0.05 && (!best || to - from > best.to - best.from)) best = { goal, from, to };
  });
  return best;
}

export interface RecapInput {
  stars: number;
  steps: number;
  onTask: number;
  streak: number;
  bestWeekday: number | null;
  growth: { text: string; from: number; to: number } | null;
  pet: { name: string; kind: string; stage: number } | null;
  goodMoods: number;
}

export type RecapSlide =
  | { kind: "hello" }
  | { kind: "stars"; n: number }
  | { kind: "steps"; n: number }
  | { kind: "streak"; n: number }
  | { kind: "weekday"; day: number }
  | { kind: "growth"; text: string; from: number; to: number }
  | { kind: "focus"; n: number }
  | { kind: "moods"; n: number }
  | { kind: "pet"; name: string; petKind: string; stage: number }
  | { kind: "next" };

/**
 * The stories, in order. Only what grew is told: a number that is zero is left out, and nothing is ever
 * compared with other children. A streak of one day is not a streak.
 */
export function recapSlides(r: RecapInput): RecapSlide[] {
  const out: RecapSlide[] = [{ kind: "hello" }];
  if (r.stars > 0) out.push({ kind: "stars", n: r.stars });
  if (r.steps > 0) out.push({ kind: "steps", n: r.steps });
  if (r.streak >= 2) out.push({ kind: "streak", n: r.streak });
  if (r.bestWeekday !== null) out.push({ kind: "weekday", day: r.bestWeekday });
  if (r.growth) out.push({ kind: "growth", ...r.growth });
  if (r.onTask > 0) out.push({ kind: "focus", n: r.onTask });
  if (r.goodMoods > 0) out.push({ kind: "moods", n: r.goodMoods });
  if (r.pet) out.push({ kind: "pet", name: r.pet.name, petKind: r.pet.kind, stage: r.pet.stage });
  out.push({ kind: "next" });
  return out;
}

/* ---------- «Карта трудных минут» ---------- */

/** A morning mood at or below this (1..5) counts as a bad start of the day. */
export const LOW_MOOD = 2;

export interface HardCell {
  /** 1 = Monday … 5 = Friday */
  day: number;
  lesson: number;
  no: number;
  rated: number;
  dates: string[];
}

/**
 * The psychologist's map: for each weekday and lesson, how often the goals did not work out (NO among
 * YES + NO, every goal of the lesson together). `keep` narrows it to some dates (short sleep, a bad morning).
 */
export function hardGrid(
  marks: readonly { date: string; lessonNo: number; value: string }[],
  weekdayOf: (d: string) => number,
  keep: (date: string) => boolean = () => true,
): { lessons: number; cells: HardCell[] } {
  const school = marks.filter((m) => m.lessonNo > 0);
  const lessons = school.reduce((a, m) => Math.max(a, m.lessonNo), 0);
  const cells: HardCell[] = [];
  for (let day = 1; day <= 5; day++)
    for (let lesson = 1; lesson <= lessons; lesson++) cells.push({ day, lesson, no: 0, rated: 0, dates: [] });
  for (const m of school) {
    if (m.value !== "YES" && m.value !== "NO") continue;
    const day = weekdayOf(m.date);
    if (day > 5 || !keep(m.date)) continue;
    const c = cells[(day - 1) * lessons + (m.lessonNo - 1)];
    c.rated++;
    if (m.value === "NO") c.no++;
    if (!c.dates.includes(m.date)) c.dates.push(m.date);
  }
  for (const c of cells) c.dates.sort();
  return { lessons, cells };
}

/** A cell needs this many rated marks before its colour means anything. */
export const HARD_MIN_RATED = 4;

/** The hardest cell with enough marks behind it; null if no cell has a NO share of at least 40 %. */
export function hardestCell(cells: readonly HardCell[]): HardCell | null {
  let best: HardCell | null = null;
  for (const c of cells) {
    if (c.rated < HARD_MIN_RATED || c.no / c.rated < 0.4) continue;
    if (!best || c.no / c.rated > best.no / best.rated || (c.no / c.rated === best.no / best.rated && c.rated > best.rated)) best = c;
  }
  return best;
}
