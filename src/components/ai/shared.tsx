"use client";

import { useI18n } from "@/lib/i18n/client";

/** Puts a value into a form field so that React, if it controls the field, sees the change too. */
export function fillField(el: HTMLInputElement | HTMLTextAreaElement | null | undefined, value: string) {
  if (!el) return;
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

/** File or recording → base64 without the "data:...;base64," head. */
export function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}

/** Who answered: Gemini, or Nazar's own rules (and why). Shown under every AI suggestion. */
export function AiSourceNote({ source, fallback }: { source: "GEMINI" | "OFFLINE"; fallback: string | null }) {
  const { t } = useI18n();
  const key = source === "GEMINI" ? "ai.badge.GEMINI" : fallback === "QUOTA" ? "ai.badge.QUOTA" : fallback === "FAILED" ? "ai.badge.FAILED" : "ai.badge.NO_KEY";
  return (
    <p className={`ai-note ${source === "GEMINI" ? "" : "offline"}`} data-ai-source={source}>
      <span aria-hidden="true">✦</span> {t(key)} {t("ai.privacy")}
    </p>
  );
}

/** Event that asks the note field of the page to add a line (the voice suggestion's note). */
export const NOTE_APPEND_EVENT = "nazar:note-append";
