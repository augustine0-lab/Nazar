// «Сканер рюкзака»: the child shows a thing to the camera and its line in the bag checklist ticks itself.
// Pure rules: which checklist lines the camera can recognise, and when a seen object counts as shown.
// The detector (EfficientDet-Lite0, trained on the 80 COCO object classes) runs in the browser.

/**
 * The COCO classes a school bag can hold, with the words in a line's title (Russian and Kazakh) or the
 * picture that mean it. Things the model does not know (a diary, a pencil case, school shoes) stay with
 * the ordinary tick.
 */
export const SCAN_THINGS = {
  book: { words: /книг|учебник|тетрад|прописи|альбом|кітап|оқулық|дәптер/i, icons: ["📚"] },
  bottle: { words: /бутыл|вод[аыуо]|термос|бөтелке|(?<!\p{L})су(?!\p{L})/iu, icons: ["💧"] },
  scissors: { words: /ножниц|қайшы/i, icons: ["✂️"] },
  apple: { words: /яблок|алма/i, icons: ["🍎"] },
  banana: { words: /банан/i, icons: [] },
  orange: { words: /апельсин|мандарин/i, icons: [] },
  sandwich: { words: /бутерброд|сэндвич|сендвич|нан мен/i, icons: [] },
  cup: { words: /кружк|стакан|кесе/i, icons: [] },
  "cell phone": { words: /телефон/i, icons: [] },
  umbrella: { words: /зонт|қолшатыр/i, icons: [] },
  "sports ball": { words: /мяч|(?<!\p{L})доп(?!\p{L})/iu, icons: [] },
  "teddy bear": { words: /мишк|игрушк|ойыншық/i, icons: [] },
  toothbrush: { words: /зубн.*щ|щётк|щетк|тіс щетка/i, icons: [] },
} as const satisfies Record<string, { words: RegExp; icons: readonly string[] }>;

export type ScanThing = keyof typeof SCAN_THINGS;
export const SCAN_LABELS = Object.keys(SCAN_THINGS) as ScanThing[];

/** Which thing the camera looks for on this line, by its title (in any of its languages) or picture; null if none. */
export function scanThingOf(titles: readonly string[], icon: string): ScanThing | null {
  for (const label of SCAN_LABELS) {
    const t = SCAN_THINGS[label];
    if (titles.some((s) => t.words.test(s))) return label;
  }
  for (const label of SCAN_LABELS) if ((SCAN_THINGS[label].icons as readonly string[]).includes(icon)) return label;
  return null;
}

/** The first line still to pack that waits for this thing; null if there is none. */
export function lineForThing<T extends { id: string; thing: ScanThing | null }>(lines: readonly T[], done: ReadonlySet<string>, thing: ScanThing): T | null {
  return lines.find((l) => l.thing === thing && !done.has(l.id)) ?? null;
}

/* ---------- when a thing counts as shown ---------- */

/** The detector's confidence from which a box counts at all. */
export const SCAN_MIN_SCORE = 0.45;
/** The thing must be in this many frames in a row: one lucky frame is not "shown". */
export const SCAN_CONFIRM_FRAMES = 3;
/** After a thing has ticked a line, it must leave the picture this long before it can tick another line. */
export const SCAN_REARM_MS = 1200;

interface ThingState {
  streak: number;
  armed: boolean;
  lastSeen: number;
}
export type ScanState = Partial<Record<ScanThing, ThingState>>;

/**
 * One camera frame at time `t` (ms) with the things seen in it. Returns the new state and the things that
 * have just counted as shown. A thing held in front of the camera counts once: to tick a second book,
 * take the first one away and show the next.
 */
export function scanStep(state: ScanState, seen: ReadonlySet<ScanThing>, t: number): { state: ScanState; shown: ScanThing[] } {
  const next: ScanState = {};
  const shown: ScanThing[] = [];
  for (const thing of SCAN_LABELS) {
    const prev = state[thing] ?? { streak: 0, armed: true, lastSeen: -Infinity };
    let s: ThingState;
    if (seen.has(thing)) {
      s = { streak: prev.streak + 1, armed: prev.armed, lastSeen: t };
      if (s.armed && s.streak >= SCAN_CONFIRM_FRAMES) {
        shown.push(thing);
        s = { ...s, armed: false };
      }
    } else {
      s = { streak: 0, armed: prev.armed || t - prev.lastSeen >= SCAN_REARM_MS, lastSeen: prev.lastSeen };
    }
    if (s.streak || !s.armed || s.lastSeen > -Infinity) next[thing] = s;
  }
  return { state: next, shown };
}
