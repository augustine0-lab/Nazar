"use client";

import { useState, useTransition } from "react";
import { setActualMinutesAction } from "@/app/actions";
import { ACTUAL_CHIPS } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/client";

/** "How long did it really take?" with one tap. Feeds the child's pace in the homework ceiling. */
export function ActualTime({ homeworkId, initial, est }: { homeworkId: string; initial: number | null; est: number | null }) {
  const { t } = useI18n();
  const [value, setValue] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const pick = (m: number) =>
    start(async () => {
      const next = value === m ? 0 : m;
      const res = await setActualMinutesAction(homeworkId, next);
      if (res?.error) setMsg(res.error);
      else {
        setValue(next || null);
        setMsg(null);
      }
    });
  return (
    <div className="stack" style={{ gap: 6 }} aria-busy={pending}>
      <span className="small">{est ? t("act.questionEst", { est }) : t("act.question")}</span>
      <div className="chips" role="group" aria-label={t("act.question")}>
        {ACTUAL_CHIPS.map((m) => (
          <button key={m} type="button" className={`chip ${value === m ? "on" : ""}`} aria-pressed={value === m} onClick={() => pick(m)}>
            {t("act.min", { n: m })}
          </button>
        ))}
        {value !== null && !(ACTUAL_CHIPS as readonly number[]).includes(value) && (
          <span className="chip on" aria-pressed="true">{t("act.min", { n: value })}</span>
        )}
      </div>
      {msg && <p className="msg err" role="alert">{msg}</p>}
    </div>
  );
}
