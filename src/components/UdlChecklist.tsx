"use client";

import { useState, useTransition } from "react";
import { setClassSupportAction } from "@/app/actions";
import { UDL_PRINCIPLES, UDL_SUPPORTS, udlCoverage } from "@/lib/domain/concepts";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n";

/** The teacher ticks what the whole class already gets; each tick is saved right away. */
export function UdlChecklist({ classId, enabled }: { classId: string; enabled: string[] }) {
  const { t } = useI18n();
  const [on, setOn] = useState(() => new Set(enabled));
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const coverage = udlCoverage(on);

  function toggle(key: string) {
    const next = new Set(on);
    const value = !next.has(key);
    if (value) next.add(key);
    else next.delete(key);
    setOn(next);
    setError(null);
    start(async () => {
      const res = await setClassSupportAction(classId, key, value);
      if (res?.error) {
        setOn(on);
        setError(res.error);
      }
    });
  }

  return (
    <div className="stack">
      <div className="row" aria-live="polite">
        {coverage.map((c) => (
          <span key={c.principle} className={`pill num ${c.on >= 3 ? "good" : c.on === 0 ? "bad" : "star"}`}>
            {t(`udl.p.${c.principle}` as MsgKey)}: {c.on}/{c.total}
          </span>
        ))}
      </div>
      {UDL_PRINCIPLES.map((p) => (
        <fieldset key={p} className="stack">
          <legend><b>{t(`udl.p.${p}` as MsgKey)}</b> <span className="muted small">{t(`udl.p.${p}.why` as MsgKey)}</span></legend>
          <ul className="sched bag udl">
            {UDL_SUPPORTS.filter((s) => s.principle === p).map((s) => {
              const isOn = on.has(s.key);
              return (
                <li key={s.key}>
                  <button type="button" className={`sched-item ${isOn ? "done" : ""}`} aria-pressed={isOn} onClick={() => toggle(s.key)}>
                    <span className="pic" aria-hidden="true">{s.icon}</span>
                    <span className="stack" style={{ gap: 2, textAlign: "left" }}>
                      <span className="ttl">{t(`udl.${s.key}.title` as MsgKey)}</span>
                      <span className="muted small">{t(`udl.${s.key}.body` as MsgKey)}</span>
                    </span>
                    <span className="tick" aria-hidden="true">{isOn ? "✓" : ""}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>
      ))}
      {error && <p className="msg err" role="alert">{error}</p>}
    </div>
  );
}
