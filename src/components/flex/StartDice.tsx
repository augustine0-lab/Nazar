"use client";

import Link from "next/link";
import { useState } from "react";
import { DICE_REROLLS, rollStart, STARTER_MINUTES, type StartOption } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/client";

const FACES = ["⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];

/**
 * "I don't know where to start": the dice picks the task and its first step, and the deal is two minutes only.
 * One reroll, so choosing does not turn into another way of putting it off.
 */
export function StartDice({ options }: { options: StartOption[] }) {
  const { t } = useI18n();
  const [pick, setPick] = useState<StartOption | null>(null);
  const [rolls, setRolls] = useState(0);
  const [rolling, setRolling] = useState(false);
  const [face, setFace] = useState(0);

  if (!options.length) return null;

  function roll() {
    if (rolling) return;
    const reduce = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const next = rollStart(options, Math.random(), pick?.homeworkId);
    setRolls((r) => r + 1);
    if (reduce) {
      setPick(next);
      return;
    }
    setRolling(true);
    let n = 0;
    const timer = setInterval(() => {
      setFace((f) => (f + 1 + Math.floor(Math.random() * 4)) % 6);
      if (++n >= 8) {
        clearInterval(timer);
        setRolling(false);
        setPick(next);
      }
    }, 90);
  }

  const canReroll = rolls <= DICE_REROLLS;
  return (
    <div className="dice stack" aria-live="polite">
      {!pick && !rolling && (
        <button type="button" className="btn dice-btn" onClick={roll}>
          <span aria-hidden="true" className="dice-face">🎲</span> {t("dice.button")}
        </button>
      )}
      {rolling && (
        <div className="dice-rolling" role="status">
          <span aria-hidden="true" className="dice-face spin">{FACES[face]}</span> {t("dice.rolling")}
        </div>
      )}
      {pick && !rolling && (
        <div className="dice-result stack">
          <span className="eyebrow">{t("dice.result")}</span>
          <b>{pick.subject}: {pick.title}</b>
          <span>{t("dice.step", { n: pick.stepNo, step: pick.step })}</span>
          <span className="muted small">{t("dice.promise", { min: STARTER_MINUTES })}</span>
          <div className="row">
            <Link className="btn primary" href={`/student/homework/${pick.homeworkId}?start=1`}>{t("dice.go")}</Link>
            {canReroll && options.length > 1 ? (
              <button type="button" className="btn" onClick={roll}>{t("dice.reroll")}</button>
            ) : (
              <span className="muted small">{t("dice.noReroll")}</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
