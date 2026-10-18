import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { DEFAULT_LANG, LANG_COOKIE, isLang, langFromHeader, makeT, resolve, type Lang } from "./index";

/** The reader's language: the cookie set by the switcher, else the browser's preference, else Russian. */
export const getLang = cache(async (): Promise<Lang> => {
  const saved = (await cookies()).get(LANG_COOKIE)?.value;
  if (isLang(saved)) return saved;
  try {
    return langFromHeader((await headers()).get("accept-language"));
  } catch {
    return DEFAULT_LANG;
  }
});

export async function getT() {
  const lang = await getLang();
  return { lang, t: makeT(lang), L: (text: string) => resolve(lang, text) };
}
