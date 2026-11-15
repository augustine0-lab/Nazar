import { Fragment } from "react";
import { EMOJI_FILES } from "./emoji-files";

/**
 * Emoji drawn as pictures (Fluent Emoji, served from our own server), so a child's schedule, moods and pet look
 * the same on every phone and computer. An emoji without a picture stays a plain emoji character.
 */
const EMOJI_RX = /(?:\p{Extended_Pictographic}️?(?:‍\p{Extended_Pictographic}️?)*)/gu;

const codeOf = (e: string) => [...e.replace(/️/g, "")].map((c) => c.codePointAt(0)!.toString(16)).join("-");

export function emojiSrc(e: string): string | null {
  const code = codeOf(e);
  return EMOJI_FILES.has(code) ? `/emoji/${code}.svg` : null;
}

/** One emoji as a picture. Decorative: the text next to it says what it is. */
export function Emoji({ e, className }: { e: string; className?: string }) {
  const src = emojiSrc(e);
  if (!src) return <span className={className} aria-hidden="true">{e}</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`emoji${className ? ` ${className}` : ""}`} src={src} alt="" aria-hidden="true" draggable={false} decoding="async" />;
}

/** A line of text where every emoji with a picture is drawn as one. */
export function EmojiText({ text }: { text: string }) {
  const parts: React.ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(EMOJI_RX)) {
    if (m.index! > last) parts.push(text.slice(last, m.index));
    parts.push(<Emoji key={m.index} e={m[0]} />);
    last = m.index! + m[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts.map((p, i) => <Fragment key={i}>{p}</Fragment>)}</>;
}
