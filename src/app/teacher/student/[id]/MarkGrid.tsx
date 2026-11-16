"use client";

import { useOptimistic, useState, useTransition } from "react";
import { setMarkAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { VoiceMarks } from "@/components/ai/VoiceMarks";

type Value = "YES" | "NO" | "NA";
type Mark = { goalId: string; lessonNo: number; value: Value };

const CLS: Record<Value, string> = { YES: "yes", NO: "no", NA: "na" };

export function MarkGrid(props: {
  studentId: string;
  date: string;
  bell: string[];
  goals: { id: string; text: string }[];
  initialMarks: Mark[];
  initialLesson: number;
  /** Show «Отметить голосом» (the school and the parent allowed AI help). */
  ai?: boolean;
}) {
  const { t } = useI18n();
  const label: Record<Value, string> = { YES: t("common.yes"), NO: t("common.no"), NA: "—" };
  const [lesson, setLesson] = useState(props.initialLesson);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [marks, apply] = useOptimistic(props.initialMarks, (state: Mark[], next: { goalId: string; lessonNo: number; value: Value | null }) => {
    const rest = state.filter((m) => !(m.goalId === next.goalId && m.lessonNo === next.lessonNo));
    return next.value ? [...rest, { goalId: next.goalId, lessonNo: next.lessonNo, value: next.value }] : rest;
  });

  const valueOf = (goalId: string, lessonNo: number) => marks.find((m) => m.goalId === goalId && m.lessonNo === lessonNo)?.value ?? null;
  const lessonDone = (n: number) => props.goals.every((g) => valueOf(g.id, n) !== null);

  function set(goalId: string, value: Value) {
    // A second tap on the same answer clears it, so mistakes are fixed without a dialog.
    const next = valueOf(goalId, lesson) === value ? null : value;
    setError(null);
    start(async () => {
      apply({ goalId, lessonNo: lesson, value: next });
      const res = await setMarkAction({ studentId: props.studentId, goalId, date: props.date, lessonNo: lesson, value: next });
      if (res?.error) setError(res.error);
      else if (next && props.goals.every((g) => (g.id === goalId ? next : valueOf(g.id, lesson)) !== null) && lesson < props.bell.length) {
        setLesson(lesson + 1);
      }
    });
  }

  /** Marks suggested by the AI for the current lesson, applied one by one like taps. */
  function applyMany(list: { goalId: string; value: Value }[]): Promise<boolean> {
    setError(null);
    const lessonNo = lesson;
    return new Promise((resolve) =>
      start(async () => {
        let ok = true;
        for (const m of list) {
          apply({ goalId: m.goalId, lessonNo, value: m.value });
          const res = await setMarkAction({ studentId: props.studentId, goalId: m.goalId, date: props.date, lessonNo, value: m.value });
          if (res?.error) {
            setError(res.error);
            ok = false;
            break;
          }
        }
        resolve(ok);
      }),
    );
  }

  return (
    <div className="stack" aria-busy={pending}>
      <div className="lessons" role="group" aria-label={t("mark.lesson")}>
        {props.bell.map((time, i) => (
          <button key={time} type="button" className={lessonDone(i + 1) ? "done" : ""} aria-pressed={lesson === i + 1} onClick={() => setLesson(i + 1)}>
            <span className="dot" />{t("mark.lessonLabel", { n: i + 1, time })}
          </button>
        ))}
      </div>
      <div>
        {props.goals.map((g) => (
          <div key={g.id} className="goal-row">
            <span>{g.text}</span>
            <span className="seg" role="group" aria-label={g.text}>
              {(["YES", "NO", "NA"] as Value[]).map((v) => (
                <button key={v} type="button" className={CLS[v]} aria-pressed={valueOf(g.id, lesson) === v} onClick={() => set(g.id, v)}>
                  {label[v]}
                </button>
              ))}
            </span>
          </div>
        ))}
      </div>
      {error && <p className="msg err" role="alert">{error}</p>}
      {props.ai && <VoiceMarks studentId={props.studentId} date={props.date} lesson={lesson} goals={props.goals} onApply={applyMany} />}
    </div>
  );
}
