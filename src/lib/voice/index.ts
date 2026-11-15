// Ready recordings of the demo living texts. A text a teacher typed has none: the browser's voice reads it.
import type { Lang } from "@/lib/i18n";
import { chapterHash, type Recording } from "@/lib/domain/voice";
import { RECORDED } from "./recorded";

const byHash = new Map<string, Recording>();
for (const langs of Object.values(RECORDED))
  for (const [lang, rec] of Object.entries(langs)) if (rec) byHash.set(`${lang}:${rec.hash}`, rec);

/**
 * The recording for a chapter, if one was made: by its "@demo..." key, or by the very same words (a teacher
 * who saved the demo text without changing a chapter keeps its voice). The player checks the words again.
 */
export function recordingFor(stored: string, title: string, text: string, lang: Lang): Recording | undefined {
  return (stored.startsWith("@") ? RECORDED[stored.slice(1)]?.[lang] : undefined) ?? byHash.get(`${lang}:${chapterHash(title, text)}`);
}
