"use client";

import { useState } from "react";
import { ActionForm } from "@/components/ActionForm";
import { submitScaleAction } from "@/app/actions";
import { SCALE_CHOICES, SCALE_INATTENTION, SCALE_ITEMS } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n";

export function ScaleForm({ studentId }: { studentId: string }) {
  const { t } = useI18n();
  const [answered, setAnswered] = useState<Set<number>>(new Set());
  const left = SCALE_ITEMS.length - answered.size;
  return (
    <ActionForm action={submitScaleAction} className="stack">
      <input type="hidden" name="studentId" value={studentId} />
      <p><b>{t("sc.how")}</b></p>
      {SCALE_ITEMS.map((key, i) => (
        <div key={key} className="stack">
          {i === 0 && <h2>{t("sc.part1")}</h2>}
          {i === SCALE_INATTENTION && <h2 style={{ marginTop: 12 }}>{t("sc.part2")}</h2>}
          <fieldset className="scale-q">
            <legend>{i + 1}. {t(key as MsgKey)}</legend>
            <div className="choices">
              {SCALE_CHOICES.map((c) => (
                <label key={c}>
                  <input
                    type="radio"
                    name={`a${i + 1}`}
                    value={c}
                    required
                    onChange={() => setAnswered((s) => new Set(s).add(i))}
                  />
                  {t(`sc.c${c}`)}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
      ))}
      <div className="row">
        <button className="btn primary" type="submit">{t("sc.submit")}</button>
        {left > 0 && <span className="muted small" role="status">{t("sc.left", { n: left })}</span>}
      </div>
    </ActionForm>
  );
}
