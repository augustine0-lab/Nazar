"use client";

import { useState, useTransition } from "react";
import { logMoodAction } from "@/app/actions";
import { MOOD_FACES } from "@/lib/icons";
import { useI18n } from "@/lib/i18n/client";

export function MoodPicker({ studentId, slot, initial }: { studentId: string; slot: "MORNING" | "AFTER_SCHOOL"; initial: number | null }) {
  const { t } = useI18n();
  const [mood, setMood] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();

  function pick(n: number) {
    const before = mood;
    setMood(n);
    setError(null);
    start(async () => {
      const res = await logMoodAction(studentId, slot, n);
      if (res?.error) {
        setMood(before);
        setError(res.error);
      }
    });
  }

  return (
    <div className="stack">
      <span className="eyebrow">{t(`mood.${slot}`)}</span>
      <div className="moods" role="group" aria-label={t("mood.title")}>
        {MOOD_FACES.map((face, i) => (
          <button key={i} type="button" aria-pressed={mood === i + 1} onClick={() => pick(i + 1)}>
            <span className="face" aria-hidden="true">{face}</span>
            <span className="lbl">{t(`mood.${(i + 1) as 1 | 2 | 3 | 4 | 5}`)}</span>
          </button>
        ))}
      </div>
      {mood !== null && mood <= 2 && <p className="msg ok" role="status">{t("mood.thanks")}</p>}
      {error && <p className="msg err" role="alert">{error}</p>}
    </div>
  );
}
