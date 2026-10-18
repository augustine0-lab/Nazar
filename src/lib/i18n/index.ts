import { common } from "./messages/common";
import { errors } from "./messages/errors";
import { login } from "./messages/login";
import { teacher } from "./messages/teacher";
import { parent } from "./messages/parent";
import { student } from "./messages/student";
import { psych } from "./messages/psych";
import { admin } from "./messages/admin";
import { demo } from "./messages/demo";
import { features } from "./messages/features";

export type Lang = "ru" | "kk";
export const LANGS: readonly Lang[] = ["ru", "kk"];
export const DEFAULT_LANG: Lang = "ru";
export const LANG_COOKIE = "nazar_lang";
export const LOCALE: Record<Lang, string> = { ru: "ru-RU", kk: "kk-KZ" };

/** Every message exists in both languages: [russian, kazakh]. A missing translation fails the type check. */
type Entry = readonly [ru: string, kk: string];
const ALL = { ...common, ...errors, ...login, ...teacher, ...parent, ...student, ...psych, ...admin, ...demo, ...features } satisfies Record<string, Entry>;

export type MsgKey = keyof typeof ALL;
export type Params = Record<string, string | number>;
/** A message that is translated later, when the reader's language is known (errors thrown in services). */
export interface Msg {
  key: MsgKey;
  params?: Params;
}
export type T = (key: MsgKey, params?: Params) => string;

export const isLang = (v: unknown): v is Lang => v === "ru" || v === "kk";

export function translate(lang: Lang, key: MsgKey, params?: Params): string {
  const text = ALL[key][lang === "kk" ? 1 : 0];
  return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text;
}

/** Demo content is stored as "@key"; everything else (what people typed) is returned unchanged. */
export function resolve(lang: Lang, text: string): string {
  if (!text.startsWith("@")) return text;
  const key = text.slice(1);
  return key in ALL ? translate(lang, key as MsgKey) : text;
}

export const makeT = (lang: Lang): T => (key, params) => translate(lang, key, params);
export const msgText = (lang: Lang, m: Msg) => translate(lang, m.key, m.params);

/** All messages of one language, for client components. */
export function dictionary(lang: Lang): Record<string, string> {
  const i = lang === "kk" ? 1 : 0;
  return Object.fromEntries(Object.entries(ALL).map(([k, v]) => [k, (v as Entry)[i]]));
}

/** Picks the language from an Accept-Language header; Kazakh only when it is listed before Russian. */
export function langFromHeader(header: string | null | undefined): Lang {
  for (const part of (header ?? "").split(",")) {
    const tag = part.trim().slice(0, 2).toLowerCase();
    if (tag === "kk") return "kk";
    if (tag === "ru") return "ru";
  }
  return DEFAULT_LANG;
}

export const WEEKDAYS: Record<Lang, string[]> = {
  ru: ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"],
  kk: ["Дс", "Сс", "Ср", "Бс", "Жм", "Сб", "Жк"],
};

export function formatDate(date: string, lang: Lang = DEFAULT_LANG): string {
  return new Intl.DateTimeFormat(LOCALE[lang], { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(date + "T12:00:00Z"));
}
