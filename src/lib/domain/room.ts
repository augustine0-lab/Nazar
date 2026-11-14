// Quiet room: children of one class do homework "next to" each other (body doubling).
// Pure rules only; the live room itself is in lib/room/hub.ts.

/** What a child says they are doing. A fixed list, so the room never becomes a chat. */
export const ROOM_ACTIVITIES = ["math", "reading", "writing", "language", "world", "drawing", "other"] as const;
export type RoomActivity = (typeof ROOM_ACTIVITIES)[number];
export const isRoomActivity = (v: unknown): v is RoomActivity => (ROOM_ACTIVITIES as readonly unknown[]).includes(v);
export const ROOM_ACTIVITY_ICON: Record<RoomActivity, string> = {
  math: "🧮",
  reading: "📖",
  writing: "✏️",
  language: "🗣️",
  world: "🌍",
  drawing: "🎨",
  other: "📚",
};

/** Lengths of the shared timer, in minutes. */
export const ROOM_TIMER_MINUTES = [10, 15, 20, 25] as const;
/** A one-minute round, offered only in show mode, so a presentation can reach the end of a round. */
export const ROOM_DEMO_MINUTES = 1;
export const isRoomTimer = (v: unknown): v is (typeof ROOM_TIMER_MINUTES)[number] => (ROOM_TIMER_MINUTES as readonly unknown[]).includes(v);

/** Video goes directly between browsers, every child to every child, so the room stays small. */
export const ROOM_MAX_PEOPLE = 12;

/** Thumbs can be sent for this long after a round ends, or until the next round starts. */
export const ROOM_THUMB_WINDOW_MS = 10 * 60_000;

export interface RoomRule {
  /** Pupils of the class whose parent turned the room on (and who have consent). */
  enabled: number;
  /** Pupils whose parent agreed to a room without an adult. */
  unsupervised: number;
  /** All pupils of the class. */
  pupils: number;
}

/** A room without an adult opens only when the parents of every pupil in the class agreed. */
export const freeRoomAllowed = (r: RoomRule) => r.pupils > 0 && r.unsupervised === r.pupils;

/** The first name, the only part of the name the room shows. */
export const firstName = (full: string) => full.trim().split(/\s+/)[0] ?? full;
