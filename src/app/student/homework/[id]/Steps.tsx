"use client";

import { useOptimistic, useTransition } from "react";
import { setStepDoneAction } from "@/app/actions";

type Step = { id: string; text: string; done: boolean };

export function Steps({ steps }: { steps: Step[] }) {
  const [, start] = useTransition();
  const [list, toggle] = useOptimistic(steps, (s: Step[], id: string) => s.map((x) => (x.id === id ? { ...x, done: !x.done } : x)));
  const current = list.findIndex((s) => !s.done);
  const doneCount = list.filter((s) => s.done).length;
  return (
    <div className="stack">
      <div className="row between">
        <h2>{current === -1 ? "Всё готово! Покажи маме или папе" : `Шаг ${current + 1}`}</h2>
        <span className="muted num">{doneCount} из {list.length}</span>
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
