import { formatDate, shortWeekday } from "@/lib/domain";
import type { Load } from "@/lib/flex-services";
import { getT } from "@/lib/i18n/server";

/**
 * The homework ceiling: every coming evening with the sum of all teachers' estimates, the child's real pace
 * and the daily norm. Seen by the teacher, the parents and the psychologist; it warns, it never blocks.
 */
export async function LoadCard({ load }: { load: Load }) {
  const { lang, t } = await getT();
  const max = Math.max((load.norm ?? 0) * 1.25, ...load.evenings.map((e) => e.likelyMinutes ?? e.estMinutes), 30);
  return (
    <div className="stack">
      <div className="load" role="list">
        {load.evenings.map((e) => {
          const real = e.likelyMinutes ?? e.estMinutes;
          return (
            <div key={e.dueDate} className={`load-row ${e.over ? "over" : ""}`} role="listitem">
              <span className="load-day small">
                <b>{shortWeekday(e.evening, lang)}</b> {formatDate(e.evening, lang)}
              </span>
              <div className="load-track" aria-hidden="true">
                {e.likelyMinutes !== null && <i className="likely" style={{ width: `${(e.likelyMinutes / max) * 100}%` }} />}
                <i className="est" style={{ width: `${(e.estMinutes / max) * 100}%` }} />
                {load.norm !== null && <span className="norm" style={{ left: `${(load.norm / max) * 100}%` }} />}
              </div>
              <span className="small num load-num">
                {e.tasks === 0
                  ? t("load.free")
                  : e.likelyMinutes !== null && e.likelyMinutes !== e.estMinutes
                    ? t("load.estLikely", { est: e.estMinutes, real })
                    : t("load.est", { est: e.estMinutes })}
                {e.unknown > 0 && <span className="muted"> {t("load.unknown", { n: e.unknown })}</span>}
                {e.over && <span className="pill bad">{t("load.over")}</span>}
              </span>
            </div>
          );
        })}
      </div>
      <p className="muted small">
        {load.norm !== null ? t("load.norm", { norm: load.norm }) : t("load.noNorm")}{" "}
        {load.pace !== null ? t("load.pace", { x: load.pace.toLocaleString(lang === "kk" ? "kk-KZ" : "ru-RU") }) : t("load.noPace")}
      </p>
      <p className="muted small">{t("load.source")}</p>
    </div>
  );
}
