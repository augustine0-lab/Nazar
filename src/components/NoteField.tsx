"use client";

import { useEffect, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { NOTE_TEMPLATES } from "@/lib/domain";

// The browser's own speech recognition; not in the TypeScript DOM types.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;
const ctor = (): RecognitionCtor | null => {
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
};

/** Note field with ready phrases and dictation, so a teacher can finish a note in a few seconds. */
export function NoteField({ name, id, defaultValue, maxLength, placeholder, label }: { name: string; id: string; defaultValue: string; maxLength: number; placeholder: string; label: string }) {
  const { t, lang } = useI18n();
  const [text, setText] = useState(defaultValue);
  const [listening, setListening] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const [canDictate, setCanDictate] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    setCanDictate(Boolean(ctor()));
    return () => rec.current?.stop();
  }, []);

  const add = (phrase: string) => setText((cur) => (cur.trim() ? `${cur.trimEnd()} ${phrase}` : phrase).slice(0, maxLength));

  function dictate() {
    if (listening) {
      rec.current?.stop();
      return;
    }
    const R = ctor();
    if (!R) return setInfo(t("nt.voiceNone"));
    const r = new R();
    r.lang = lang === "kk" ? "kk-KZ" : "ru-RU";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) add(e.results[i][0].transcript.trim());
    };
    r.onend = () => setListening(false);
    r.onerror = () => {
      setListening(false);
      setInfo(t("nt.voiceNone"));
    };
    rec.current = r;
    setInfo(null);
    setListening(true);
    r.start();
  }

  return (
    <div className="stack">
      <label>
        {label}
        <textarea name={name} id={id} rows={3} value={text} onChange={(e) => setText(e.target.value)} maxLength={maxLength} placeholder={placeholder} />
      </label>
      <div className="stack" style={{ gap: 6 }}>
        <span className="muted small">{t("nt.label")}</span>
        <div className="chips">
          {NOTE_TEMPLATES.map((k) => (
            <button key={k} type="button" className="chip" onClick={() => add(t(`nt.${k}`))}>{t(`nt.${k}`)}</button>
          ))}
          {canDictate && (
            <button type="button" className="chip" aria-pressed={listening} onClick={dictate}>
              🎤 {listening ? t("nt.voiceStop") : t("nt.voice")}
            </button>
          )}
        </div>
        {listening && <span className="muted small" role="status">{t("nt.voiceListening")}</span>}
        {info && <span className="msg err" role="status">{info}</span>}
      </div>
    </div>
  );
}
