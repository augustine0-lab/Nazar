"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pinInstruction, cleanPhrase, type Pinned } from "@/lib/domain/wow";
import { LOCALE } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";

// The browser's speech recognition (Chrome, Edge, Safari) has no types in TypeScript's DOM library yet.
interface SpeechResult { isFinal: boolean; 0: { transcript: string } }
interface SpeechEvent { resultIndex: number; results: ArrayLike<SpeechResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => Recognition;
function recognitionCtor(): RecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const HEARD_KEEP = 4;
type CapError = "unsupported" | "denied" | "network";

function load(key: string): Pinned[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? "[]");
    return Array.isArray(v) ? v.filter((p) => typeof p?.text === "string").map((p) => ({ text: p.text, done: Boolean(p.done) })) : [];
  } catch {
    return [];
  }
}

/**
 * «Инструкция, которая не улетает»: the teacher speaks, the words appear on the board as subtitles, and a
 * phrase the teacher pins stays as a numbered point. A child who missed it looks at the board instead of asking.
 * The points can be typed too. They are kept only in this browser, per class.
 */
export function BoardCaptions({ storeKey, listening, onListening }: { storeKey: string; listening: boolean; onListening: (on: boolean) => void }) {
  const { t, lang } = useI18n();
  const [pinned, setPinned] = useState<Pinned[]>([]);
  const [heard, setHeard] = useState<string[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<CapError | null>(null);
  const [typed, setTyped] = useState("");
  const rec = useRef<Recognition | null>(null);
  const want = useRef(false);

  useEffect(() => setPinned(load(storeKey)), [storeKey]);
  const save = useCallback(
    (next: Pinned[]) => {
      setPinned(next);
      try {
        localStorage.setItem(storeKey, JSON.stringify(next));
      } catch {
        /* private window: the points still show */
      }
    },
    [storeKey],
  );
  const pin = (text: string) => save(pinInstruction(pinned, text));

  const stopRec = useCallback(() => {
    want.current = false;
    rec.current?.stop();
    rec.current = null;
    setInterim("");
  }, []);

  useEffect(() => {
    if (!listening) {
      stopRec();
      return;
    }
    const Ctor = recognitionCtor();
    if (!Ctor) {
      setError("unsupported");
      onListening(false);
      return;
    }
    setError(null);
    want.current = true;
    const r = new Ctor();
    r.lang = LOCALE[lang];
    r.continuous = true;
    r.interimResults = true;
    r.onresult = (e) => {
      let now = "";
      for (let k = e.resultIndex; k < e.results.length; k++) {
        const res = e.results[k];
        const text = res[0].transcript;
        if (res.isFinal) {
          const clean = cleanPhrase(text);
          if (clean) setHeard((h) => [...h, clean].slice(-HEARD_KEEP));
        } else now += text;
      }
      setInterim(now);
    };
    r.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("denied");
        want.current = false;
        onListening(false);
      } else if (e.error === "network") {
        setError("network");
        want.current = false;
        onListening(false);
      }
    };
    // Chrome stops listening after a silence: start again while the teacher has subtitles on.
    r.onend = () => {
      if (want.current) {
        try {
          r.start();
        } catch {
          /* already starting */
        }
      }
    };
    rec.current = r;
    try {
      r.start();
    } catch {
      setError("unsupported");
      onListening(false);
    }
    return stopRec;
  }, [listening, lang, onListening, stopRec]);

  // P pins the last phrase heard, from anywhere on the page except a text field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "p" && e.key.toLowerCase() !== "з") return;
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      const last = heard.at(-1);
      if (last) save(pinInstruction(pinned, last));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [heard, pinned, save]);

  return (
    <div className="cap">
      {pinned.length > 0 ? (
        <ol className="cap-pins" aria-label={t("cap.pinned")}>
          {pinned.map((p, k) => (
            <li key={`${k}-${p.text}`} className={p.done ? "done" : ""}>
              <button type="button" className="cap-pin" aria-pressed={p.done} onClick={() => save(pinned.map((x, j) => (j === k ? { ...x, done: !x.done } : x)))} title={t("cap.doneHint")}>
                <span className="n num">{k + 1}</span> <span className="txt">{p.text}</span>
              </button>
              <button type="button" className="cap-x no-print" aria-label={t("cap.remove", { text: p.text })} onClick={() => save(pinned.filter((_, j) => j !== k))}>×</button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="muted cap-empty">{t("cap.empty")}</p>
      )}

      {(listening || heard.length > 0) && (
        <div className="cap-live" aria-live="polite">
          {heard.map((h, k) => (
            <button key={`${k}-${h}`} type="button" className="cap-heard" onClick={() => pin(h)} title={t("cap.pinHint")}>
              <span aria-hidden="true">📌</span> {h}
            </button>
          ))}
          {interim && <span className="cap-interim">{interim}</span>}
          {listening && !interim && !heard.length && <span className="cap-interim muted">{t("cap.listening")}</span>}
        </div>
      )}

      <form
        className="cap-type no-print"
        onSubmit={(e) => {
          e.preventDefault();
          pin(typed);
          setTyped("");
        }}
      >
        <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={t("cap.typePh")} aria-label={t("cap.typeAria")} maxLength={200} />
        <button type="submit" className="btn" disabled={!typed.trim()}>{t("cap.add")}</button>
        {heard.length > 0 && <button type="button" className="btn" onClick={() => pin(heard.at(-1)!)}>{t("cap.pinLast")}</button>}
        {pinned.length > 0 && <button type="button" className="btn quiet" onClick={() => save([])}>{t("cap.clear")}</button>}
      </form>
      {error && <p role="alert" className="small">{t(`cap.err.${error}`)}</p>}
      {listening && <p className="muted small no-print">{t("cap.privacy")}</p>}
    </div>
  );
}
