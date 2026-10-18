"use client";

import { useState, useTransition } from "react";
import { setMarkAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";

/** Parent marks home goals once a day (lesson 0). */
export function HomeGoals(props: { studentId: string; date: string; goals: { id: string; text: string; value: "YES" | "NO" | "NA" | null }[] }) {
  const { t } = useI18n();
  const [values, setValues] = useState(Object.fromEntries(props.goals.map((g) => [g.id, g.value])));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  function set(goalId: string, v: "YES" | "NO") {
    const next = values[goalId] === v ? null : v;
    setValues({ ...values, [goalId]: next });
    start(async () => {
      const res = await setMarkAction({ studentId: props.studentId, goalId, date: props.date, lessonNo: 0, value: next });
      if (res?.error) setError(res.error);
    });
  }
  return (
    <div>
      {props.goals.map((g) => (
        <div key={g.id} className="goal-row">
          <span>{g.text}</span>
          <span className="seg" role="group" aria-label={g.text}>
            <button type="button" className="yes" aria-pressed={values[g.id] === "YES"} onClick={() => set(g.id, "YES")}>{t("common.yes")}</button>
            <button type="button" className="no" aria-pressed={values[g.id] === "NO"} onClick={() => set(g.id, "NO")}>{t("common.no")}</button>
          </span>
        </div>
      ))}
      {error && <p className="msg err" role="alert">{error}</p>}
    </div>
  );
}
