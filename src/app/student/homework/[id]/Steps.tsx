"use client";

import { useOptimistic, useTransition } from "react";
import { setStepDoneAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";

type Step = { id: string; text: string; done: boolean };

export function Steps({ steps }: { steps: Step[] }) {
  const { t } = useI18n();
  const [, start] = useTransition();
  const [list, toggle] = useOptimistic(steps, (s: Step[], id: string) => s.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  const current = list.findIndex((s) => !s.done);
  const doneCount = list.filter((s) => s.done).length;
  return (
    <div className="stack">
      <div className="row between">
        <h2>{current === -1 ? t("st.allDone") : t("st.stepN", { n: current + 1 })}</h2>
        <span className="muted num">{t("st.progress", { done: doneCount, n: list.length })}</span>
      </div>
      <div className="steps">
        {list.map((s, i) => (
          <button
            key={s.id}
            type="button"
            className={`step ${s.done ? "done" : ""} ${i === current ? "current" : ""}`}
            aria-pressed={s.done}
            onClick={() => start(async () => { toggle(s.id); await setStepDoneAction(s.id, !s.done); })}
          >
            <span className="box" aria-hidden="true">{s.done ? "✓" : ""}</span>
            <span>{s.text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
