import type { PetKind, ScheduleIcon } from "@/db/schema";

// Pictograms are emoji: no image files to load, and every device draws them.
export const SCHEDULE_EMOJI: Record<ScheduleIcon, string> = {
  wake: "⏰",
  wash: "🪥",
  eat: "🍽️",
  dress: "👕",
  bag: "🎒",
  school: "🏫",
  walk: "🚶",
  homework: "📚",
  play: "🧩",
  read: "📖",
  bath: "🛁",
  sleep: "🌙",
};

export const MOOD_FACES = ["😣", "😟", "😐", "🙂", "😄"] as const;

export const PET_EMOJI: Record<PetKind, string> = { fox: "🦊", cat: "🐱", owl: "🦉", dino: "🦖" };
export const PET_ACCESSORY = ["", "", "⭐", "🏅", "👑"] as const;

export const BREAK_EMOJI = { stretch: "🙆", jumps: "🦘", wall: "🧱", breathe: "🌬️", shake: "🐕", march: "🥁" } as const;
