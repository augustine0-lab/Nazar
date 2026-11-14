"use client";

import { useEffect, useState } from "react";
import { STARTER_MINUTES } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/client";

/** After the start dice: a two-minute promise. When it ends the child may stop, and that is fine. */
export function StarterBanner({ step }: { step: string | null }) {
  const { t } = useI18n();
  const [left, setLeft] = useState(STARTER_MINUTES * 60);
  const [started, setStarted] = useState(false);
  useEffect(() => {
    if (!started || left <= 0) return;
    const id = setTimeout(() => setLeft((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [started, left]);
  const mm = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <section className="card starter" role="status">
      <span className="eyebrow">🎲 {t("starter.title", { min: STARTER_MINUTES })}</span>
      {step && <b>{step}</b>}
      {left > 0 ? (
        <div className="row">
          {started ? <span className="starter-time num">{mm}</span> : <button className="btn primary" type="button" onClick={() => setStarted(true)}>{t("starter.go")}</button>}
          <span className="muted small">{t("starter.hint")}</span>
        </div>
      ) : (
        <p className="msg ok">{t("starter.done", { min: STARTER_MINUTES })}</p>
      )}
    </section>
  );
}
