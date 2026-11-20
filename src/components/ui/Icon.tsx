import { useId } from "react";
import {
  AppWindow, Armchair, Backpack, Bell, BicepsFlexed, BookHeart, BookOpen, BookOpenText, CalendarClock, CalendarDays, Camera,
  Check, CircleCheck, CircleX, ClipboardList, Dices, DoorOpen, Download, Eye, Gift, GraduationCap, Handshake, HeartHandshake,
  Headphones, House, Leaf, LifeBuoy, Lightbulb, LogOut, Maximize, MessageCircle, Mic, NotebookPen, Pause, Phone, PiggyBank,
  Play, Presentation, Printer, School, Smartphone, Sparkles, Star, Sun, TriangleAlert, UserRound, UsersRound, Volume2, VolumeX,
  type LucideIcon,
} from "lucide-react";

/**
 * One line-icon set (Lucide, ISC licence) for the app's buttons, menus and headings,
 * so the interface does not depend on how each phone draws emoji.
 * Children's pictures (schedule, moods, pets) are Fluent Emoji pictures, see Emoji.tsx.
 */
const ICONS = {
  bell: Bell, logout: LogOut, install: Download, phone: Smartphone,
  home: House, today: Sun, week: CalendarDays, schedule: CalendarClock, rewards: Gift, homework: NotebookPen, plan: ClipboardList,
  chat: MessageCircle, help: LifeBuoy, techniques: Lightbulb, room: UsersRound, read: BookOpenText, stories: BookHeart,
  classForAll: Presentation, school: School, kids: HeartHandshake, user: UserRound, teacher: GraduationCap,
  deal: Handshake, sound: Headphones, piggy: PiggyBank, bag: Backpack, play: Play, pause: Pause, fullscreen: Maximize,
  print: Printer, speak: Volume2, mute: VolumeX, camera: Camera, mic: Mic, book: BookOpen, seat: Armchair, window: AppWindow,
  door: DoorOpen, dice: Dices, warn: TriangleAlert, yes: CircleCheck, no: CircleX, strong: BicepsFlexed, star: Star,
  leaf: Leaf, call: Phone, check: Check, eye: Eye, sparkles: Sparkles,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

/** A block icon (top bar, menu). */
export function Icon({ name, className = "ico" }: { name: IconName; className?: string }) {
  const C = ICONS[name];
  return <C className={className} aria-hidden="true" strokeWidth={1.8} />;
}

/** An icon inside a line of text: a heading, a button or a list item. */
export function I({ name }: { name: IconName }) {
  return <Icon name={name} className="ico-inline" />;
}

/** The Nazar mark: an eye in soft gradient rings. */
export function BrandMark({ size = 28 }: { size?: number }) {
  // Each mark owns its gradient: with one shared id, a mark inside a hidden
  // block (the login hero on a phone) took the gradient with it and every other
  // mark on the page lost its colour.
  const ring = `nz-ring-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={ring} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#7b6cf6" />
          <stop offset="1" stopColor="#3fb6a8" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="16" fill={`url(#${ring})`} />
      <path d="M4.5 16c3-5 7-7.5 11.5-7.5S24.5 11 27.5 16c-3 5-7 7.5-11.5 7.5S7.5 21 4.5 16Z" fill="#fff" />
      <circle cx="16" cy="16" r="5" fill="#1c1b33" />
      <circle cx="17.8" cy="14.2" r="1.6" fill="#fff" />
    </svg>
  );
}

/** Up to two initials for an avatar circle. */
export function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join("");
}
