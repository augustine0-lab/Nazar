"use client";

import { Emoji } from "@/components/ui/Emoji";
import { Icon } from "@/components/ui/Icon";
import { useState, useTransition } from "react";
import { setBagDoneAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { scanThingOf } from "@/lib/domain/scan";
import { BagScanner } from "./bag/BagScanner";

export interface BagEntry {
  id: string;
  title: string;
  icon: string;
}

/**
 * The evening "pack your bag" checklist. The child taps each thing as it goes into the bag, or shows it to
 * the camera («Покажи роботу») when the detector knows that kind of thing.
 */
export function BagList({ items, doneIds, interactive }: { items: BagEntry[]; doneIds: string[]; interactive: boolean }) {
  const { t, L } = useI18n();
  const [done, setDone] = useState(() => new Set(doneIds));
  const [error, setError] = useState<string | null>(null);
  const [scanned, setScanned] = useState<Set<string>>(() => new Set());
  const [, start] = useTransition();
  const count = items.filter((i) => done.has(i.id)).length;

  function mark(id: string, isDone: boolean) {
    setDone((prev) => {
      const next = new Set(prev);
      if (isDone) next.add(id);
      else next.delete(id);
      return next;
    });
    setError(null);
    start(async () => {
      const res = await setBagDoneAction(id, isDone);
      if (res?.error) {
        setDone((prev) => {
          const back = new Set(prev);
          if (isDone) back.delete(id);
          else back.add(id);
          return back;
        });
        setError(res.error);
      }
    });
  }
  const toggle = (id: string) => mark(id, !done.has(id));
  const found = (id: string) => {
    setScanned((prev) => new Set(prev).add(id));
    mark(id, true);
  };
  const lines = items.map((it) => {
    const title = L(it.title);
    return { id: it.id, title, thing: scanThingOf([title, it.title], it.icon) };
  });

  if (!items.length) return <p className="muted">{t("bag.empty")}</p>;
  return (
    <div className="stack">
      <div className="row between">
        <span className="muted num">{t("bag.progress", { done: count, total: items.length })}</span>
        {count === items.length && <span className="pill good">{t("bag.allDone")}</span>}
      </div>
      <div className="bar" aria-hidden="true"><i style={{ width: `${(count / items.length) * 100}%` }} /></div>
      {interactive && <BagScanner lines={lines} done={done} onFound={found} />}
      <ul className="sched bag">
        {items.map((it) => {
          const isDone = done.has(it.id);
          const title = L(it.title);
          return (
            <li key={it.id}>
              <button
                type="button"
                className={`sched-item ${isDone ? "done" : ""}${isDone && scanned.has(it.id) ? " scanned" : ""}`}
                aria-pressed={isDone}
                aria-label={t("bag.mark", { title })}
                disabled={!interactive}
                onClick={() => toggle(it.id)}
              >
                <span className="pic" aria-hidden="true"><Emoji e={it.icon} /></span>
                <span><span className="ttl">{title}</span></span>
                <span className="tick" aria-hidden="true">{isDone ? <Icon name="check" className="ico tick-ico" /> : null}</span>
              </button>
            </li>
          );
        })}
      </ul>
      {error && <p className="msg err" role="alert">{error}</p>}
    </div>
  );
}
