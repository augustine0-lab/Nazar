// Rules for social stories, the bag checklist, the saving goal, the weekly parent report,
// the sleep diary and e-mail. Pure functions only.

/* ---------- social stories ---------- */

export interface StoryStep {
  icon: string;
  text: string;
}

/** Built-in stories; titles and steps are message keys so they read in both languages. */
export const LIBRARY_STORIES = [
  { id: "sit", icon: "🪑", steps: ["👀", "🤲", "🙋", "⏳", "⭐"] },
  { id: "stuck", icon: "🧩", steps: ["😮‍💨", "🔁", "🙋", "✂️", "💪"] },
  { id: "angry", icon: "🌋", steps: ["✋", "🌬️", "🔢", "🗣️", "🤝"] },
  { id: "switch", icon: "🔔", steps: ["⏰", "📦", "🎒", "🚶", "📖"] },
  { id: "quarrel", icon: "💬", steps: ["🚶", "🌬️", "🗣️", "👂", "🤝"] },
  { id: "wait", icon: "⏳", steps: ["👀", "🤐", "✋", "🔢", "😊"] },
] as const;
export type LibraryStoryId = (typeof LIBRARY_STORIES)[number]["id"];

/** Library stories in the same shape as stored ones; "@key" texts are translated on screen. */
export function libraryStories(): { id: string; title: string; icon: string; steps: StoryStep[] }[] {
  return LIBRARY_STORIES.map((st) => ({
    id: `lib-${st.id}`,
    title: `@story.${st.id}.title`,
    icon: st.icon,
    steps: st.steps.map((icon, i) => ({ icon, text: `@story.${st.id}.s${i + 1}` })),
  }));
}

export const MAX_STORY_STEPS = 8;
export const DEFAULT_STEP_ICON = "➡️";

/**
 * One step per line. A line may start with a picture and a bar: "🙋 | Поднимаю руку".
 * Empty lines are skipped.
 */
export function parseStorySteps(text: string): StoryStep[] {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const bar = line.indexOf("|");
      if (bar > 0 && bar <= 12) {
        const icon = line.slice(0, bar).trim();
        const rest = line.slice(bar + 1).trim();
        if (icon && rest) return { icon, text: rest };
      }
      return { icon: DEFAULT_STEP_ICON, text: line };
    });
}

/* ---------- evening bag checklist ---------- */

export const BAG_ICONS = ["📚", "📓", "✏️", "📏", "🎨", "👟", "🍎", "💧", "📝", "🎒"] as const;
export const MAX_BAG_ITEMS = 15;
/** From this hour the checklist is shown first on the child's screen. */
export const BAG_EVENING_HOUR = 15;

/* ---------- saving goal ---------- */

export function goalProgress(balance: number, cost: number): { pct: number; left: number; milestone: 0 | 1 | 2 | 3 | 4 } {
  const pct = cost > 0 ? Math.min(100, Math.floor((balance / cost) * 100)) : 100;
  return { pct, left: Math.max(0, cost - balance), milestone: Math.min(4, Math.floor(pct / 25)) as 0 | 1 | 2 | 3 | 4 };
}

/* ---------- weekly parent report ---------- */

/** Differences under five points are noise for a week of school marks. */
export const TREND_TOLERANCE = 0.05;

export function trend(now: number | null, before: number | null): "UP" | "DOWN" | "SAME" | null {
  if (now === null || before === null) return null;
  if (now - before > TREND_TOLERANCE) return "UP";
  if (before - now > TREND_TOLERANCE) return "DOWN";
  return "SAME";
}

/* ---------- sleep diary ---------- */

/** Lower bound of the sleep recommended for children of 6–12 years (AASM consensus, 9–12 hours). */
export const SHORT_SLEEP_HOURS = 9;

export function validSleep(h: unknown): h is number {
  return typeof h === "number" && Number.isFinite(h) && h >= 0 && h <= 16 && Math.round(h * 2) === h * 2;
}

/**
 * Average school result on days after short and after enough sleep. Shown with a warning:
 * a pattern in a few weeks is a reason to talk, not proof of cause.
 */
export function sleepVsDay(pairs: { sleep: number | null; ratio: number | null }[]) {
  const pick = (f: (h: number) => boolean) => {
    const xs = pairs.filter((p) => p.sleep !== null && p.ratio !== null && f(p.sleep));
    return { days: xs.length, avg: xs.length ? xs.reduce((a, p) => a + p.ratio!, 0) / xs.length : null };
  };
  return { short: pick((h) => h < SHORT_SLEEP_HOURS), enough: pick((h) => h >= SHORT_SLEEP_HOURS) };
}

/* ---------- e-mail ---------- */

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const isEmail = (s: string) => s.length <= 254 && EMAIL_RE.test(s);
