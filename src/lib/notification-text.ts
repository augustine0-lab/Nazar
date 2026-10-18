import { dictionary, resolve, translate, type Lang, type MsgKey } from "./i18n";

/** The text of a stored notification in the reader's language; demo content inside parameters is translated too. */
export function notificationText(lang: Lang, n: { kind: string; params: Record<string, string | number> | null }): string {
  if (!(n.kind in dictionary("ru"))) return n.kind;
  const params = Object.fromEntries(Object.entries(n.params ?? {}).map(([k, v]) => [k, typeof v === "string" ? resolve(lang, v) : v]));
  return translate(lang, n.kind as MsgKey, params);
}
