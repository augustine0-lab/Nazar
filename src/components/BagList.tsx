"use client";

import { useState, useTransition } from "react";
import { setBagDoneAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";

export interface BagEntry {
  id: string;
  title: string;
  icon: string;
}

/** The evening "pack your bag" checklist. The child taps each thing as it goes into the bag. */
export function BagList({ items, doneIds, interactive }: { items: BagEntry[]; doneIds: string[]; interactive: boolean }) {
  const { t, L } = useI18n();
  const [done, setDone] = useState(() => new Set(doneIds));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const count = items.filter((i) => done.has(i.id)).length;

  function toggle(id: string) {
    const next = new Set(done);
    const isDone = !next.has(id);
    if (isDone) next.add(id);
    else next.delete(id);
    setDone(next);
    setError(null);
    start(async () => {
      const res = await setBagDoneAction(id, isDone);
      if (res?.error) {
        setDone(done);
        setError(res.error);
      }
    });
  }

  if (!items.length) return <p className="muted">{t("bag.empty")}</p>;
  return (
    <div className="stack">
      <div className="row between">
        <span className="muted num">{t("bag.progress", { done: count, total: items.length })}</span>
        {count === items.length && <span className="pill good">{t("bag.allDone")}</span>}
      </div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${(count / items.length) * 100}%` }} /></div>
      <ul className="sched bag">
        {items.map((it) => {
          const isDone = done.has(it.id);
          const title = L(it.title);
          return (
            <li key={it.id}>
              <button
                type="button"
                className={`sched-item ${isDone ? "done" : ""}`}
                aria-pressed={isDone}
                aria-label={t("bag.mark", { title })}
                disabled={!interactive}
                onClick={() => toggle(it.id)}
              >
                <span className="pic" aria-hidden="true">{it.icon}</span>
                <span><span className="ttl">{title}</span></span>
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
