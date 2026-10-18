"use client";

import { createContext, useContext, useMemo } from "react";
import { formatDate, resolve, type Lang, type MsgKey, type Params, type T } from "./index";

interface Ctx {
  lang: Lang;
  messages: Record<string, string>;
}
const I18nContext = createContext<Ctx>({ lang: "ru", messages: {} });

export function I18nProvider({ lang, messages, children }: Ctx & { children: React.ReactNode }) {
  const value = useMemo(() => ({ lang, messages }), [lang, messages]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const { lang, messages } = useContext(I18nContext);
  const t: T = (key: MsgKey, params?: Params) => {
    const text = messages[key] ?? key;
    return params ? text.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : text;
  };
  return { lang, t, L: (text: string) => resolve(lang, text), date: (d: string) => formatDate(d, lang) };
}
