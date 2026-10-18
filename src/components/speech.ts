// Thin wrapper over the browser's speech synthesis (read aloud). Nothing is sent to a server.
import type { Lang } from "@/lib/i18n";

const TAG: Record<Lang, string> = { ru: "ru-RU", kk: "kk-KZ" };

export const speechSupported = () => typeof window !== "undefined" && "speechSynthesis" in window;

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** Returns "novoice" when the device has no voice for the language, so the caller can tell the reader. */
export function speak(text: string, lang: Lang, onEnd?: () => void): "ok" | "novoice" | "empty" {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "empty";
  const synth = window.speechSynthesis;
  const voices = synth.getVoices();
  if (voices.length && !voices.some((v) => v.lang.toLowerCase().startsWith(lang))) return "novoice";
  synth.cancel();
  const u = new SpeechSynthesisUtterance(clean);
  u.lang = TAG[lang];
  u.rate = 0.95;
  u.onend = () => onEnd?.();
  u.onerror = () => onEnd?.();
  synth.speak(u);
  return "ok";
}
