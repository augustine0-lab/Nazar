"use client";

import { useState, useTransition } from "react";
import { setScheduleDoneAction } from "@/app/actions";
import { SCHEDULE_EMOJI } from "@/lib/icons";
import { scheduleProgress } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/client";
import type { ScheduleIcon } from "@/db/schema";

export interface ScheduleEntry {
  id: string;
  time: string;
  title: string;
  icon: ScheduleIcon;
}

/** Today's pictogram schedule. The child taps an item when it is done; adults only look. */
export function ScheduleList({ items, doneIds, interactive }: { items: ScheduleEntry[]; doneIds: string[]; interactive: boolean }) {
  const { t, L } = useI18n();
  const [done, setDone] = useState(() => new Set(doneIds));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const progress = scheduleProgress(items, done);

  function toggle(id: string) {
    const next = new Set(done);
    const isDone = !next.has(id);
    if (isDone) next.add(id);
    else next.delete(id);
    setDone(next);
    setError(null);
    start(async () => {
      const res = await setScheduleDoneAction(id, isDone);
      if (res?.error) {
        setDone(done);
        setError(res.error);
      }
    });
  }

  if (!items.length) return <p className="muted">{t("sch.empty")}</p>;
  return (
    <div className="stack">
      <div className="row between">
        <span className="muted num">{t("sch.progress", { done: progress.done, total: progress.total })}</span>
        {progress.done === progress.total && <span className="pill good">{t("sch.allDone")}</span>}
      </div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${(progress.done / progress.total) * 100}%` }} /></div>
      <ul className="sched">
        {items.map((it) => {
          const isDone = done.has(it.id);
          const title = L(it.title);
          return (
            <li key={it.id}>
              <button
                type="button"
                className={`sched-item ${isDone ? "done" : ""} ${progress.currentId === it.id ? "current" : ""}`}
                aria-pressed={isDone}
                aria-label={t("sch.markDone", { title })}
                disabled={!interactive}
                onClick={() => toggle(it.id)}
              >
                <span className="pic" aria-hidden="true">{SCHEDULE_EMOJI[it.icon]}</span>
                <span>
                  <span className="time num">{it.time}{progress.currentId === it.id ? ` · ${t("sch.now")}` : ""}</span>
                  <span className="ttl">{title}</span>
                </span>
                <span className="tick" aria-hidden="true">{isDone ? "✓" : ""}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="msg err" role="alert">{error}</p>}
    </div>
  );
}
