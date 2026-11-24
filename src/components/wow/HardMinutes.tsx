"use client";

import { useState } from "react";
import { HARD_MIN_RATED, hardestCell, type HardCell } from "@/lib/domain/wow";
import { useI18n } from "@/lib/i18n/client";

type Layer = "all" | "sleep" | "mood";

/**
 * «Карта трудных минут»: weekday × lesson, coloured by how often the goals did not work out. Layers narrow it
 * to the days after a short night or with a bad morning, so the psychologist looks for "when and after what"
 * instead of "what is wrong with the child". A cell with few marks is drawn pale: it does not mean much yet.
 */
export function HardMinutes({
  lessons,
  layers,
  notes,
  shortSleepDays,
  lowMoodDays,
  weeks,
}: {
  lessons: number;
  layers: { all: HardCell[]; sleep: HardCell[] | null; mood: HardCell[] | null };
  notes: Record<string, string[]>;
  shortSleepDays: number;
  lowMoodDays: number;
  weeks: number;
}) {
  const { t, date } = useI18n();
  const [layer, setLayer] = useState<Layer>("all");
  const [pick, setPick] = useState<HardCell | null>(null);
  const cells = layers[layer] ?? layers.all;
  const hardest = hardestCell(cells);
  const at = (day: number, lesson: number) => cells[(day - 1) * lessons + (lesson - 1)];
  const dayName = (d: number) => t(`hm.day.${d}` as "hm.day.1");

  if (!lessons) return <p className="muted">{t("ps.noData")}</p>;

  const choices: { id: Layer; label: string; n?: number }[] = [
    { id: "all", label: t("hm.all", { n: weeks }) },
    ...(layers.sleep ? [{ id: "sleep" as const, label: t("hm.sleep"), n: shortSleepDays }] : []),
    ...(layers.mood ? [{ id: "mood" as const, label: t("hm.mood"), n: lowMoodDays }] : []),
  ];
  const picked = pick ? at(pick.day, pick.lesson) : null;

  return (
    <div className="hm">
      <div className="hm-layers" role="radiogroup" aria-label={t("hm.layers")}>
        {choices.map((c) => (
          <button key={c.id} type="button" role="radio" aria-checked={layer === c.id} className={layer === c.id ? "on" : ""} onClick={() => { setLayer(c.id); setPick(null); }}>
            {c.label}{c.n !== undefined && <span className="muted"> · {t("hm.days", { n: c.n })}</span>}
          </button>
        ))}
      </div>

      <p className="hm-lead" role="status">
        {hardest
          ? t("hm.hardest", { day: dayName(hardest.day), lesson: hardest.lesson, no: hardest.no, n: hardest.rated })
          : t("hm.none")}
      </p>

      <div className="table-wrap">
        <table className="hm-grid">
          <caption className="sr-only">{t("hm.caption")}</caption>
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{t("hm.dayCol")}</span></th>
              {Array.from({ length: lessons }, (_, k) => <th key={k} scope="col">{t("hm.lesson", { n: k + 1 })}</th>)}
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3, 4, 5].map((day) => (
              <tr key={day}>
                <th scope="row">{dayName(day)}</th>
                {Array.from({ length: lessons }, (_, k) => {
                  const c = at(day, k + 1);
                  const share = c.rated ? c.no / c.rated : 0;
                  const thin = c.rated < HARD_MIN_RATED;
                  const isHard = hardest && hardest.day === day && hardest.lesson === k + 1;
                  return (
                    <td key={k}>
                      <button
                        type="button"
                        className={`hm-cell${share >= 0.45 ? " strong" : ""}${thin ? " thin" : ""}${isHard ? " hard" : ""}${picked === c ? " picked" : ""}`}
                        style={{ "--h": c.rated ? share.toFixed(2) : "0" } as React.CSSProperties}
                        disabled={!c.rated}
                        aria-label={c.rated ? t("hm.cellAria", { day: dayName(day), lesson: k + 1, no: c.no, n: c.rated }) : t("hm.cellEmpty", { day: dayName(day), lesson: k + 1 })}
                        onClick={() => setPick(c)}
                      >
                        {c.rated ? <><b>{Math.round(share * 100)}%</b><span>{c.no}/{c.rated}</span></> : "·"}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="hm-legend" aria-hidden="true">
        <span>{t("hm.easy")}</span><span className="scale" /><span>{t("hm.hard")}</span>
      </div>

      {picked && (
        <section className="hm-pick" aria-live="polite">
          <h3>{t("hm.pickTitle", { day: dayName(picked.day), lesson: picked.lesson })}</h3>
          <p>{t("hm.pickLine", { no: picked.no, n: picked.rated, dates: picked.dates.length })}</p>
          {picked.dates.some((d) => notes[d]?.length) ? (
            <ul>
              {picked.dates.filter((d) => notes[d]?.length).map((d) => (
                <li key={d}><b>{date(d)}</b>: {notes[d].join(" · ")}</li>
              ))}
            </ul>
          ) : (
            <p className="muted small">{t("hm.noNotes")}</p>
          )}
        </section>
      )}
      <p className="muted small">{t("hm.caveat", { n: HARD_MIN_RATED })}</p>
    </div>
  );
}
