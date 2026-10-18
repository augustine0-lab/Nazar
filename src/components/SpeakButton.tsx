"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { speak, speechSupported, stopSpeaking } from "./speech";

/** Reads the given text aloud. Hidden when the browser cannot speak. */
export function SpeakButton({ text }: { text: string }) {
  const { t, lang } = useI18n();
  const [ok, setOk] = useState(false);
  const [on, setOn] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  useEffect(() => {
    setOk(speechSupported());
    return () => stopSpeaking();
  }, []);
  if (!ok) return null;
  return (
    <>
      <button
        type="button"
        className="btn quiet"
        onClick={() => {
          if (on) {
            stopSpeaking();
            setOn(false);
            return;
          }
          const res = speak(text, lang, () => setOn(false));
          setNote(res === "novoice" ? t("a11y.noVoice") : null);
          setOn(res === "ok");
        }}
      >
        🔊 {on ? t("speak.stop") : t("speak.read")}
      </button>
      {note && <span className="muted small" role="status">{note}</span>}
    </>
  );
}
