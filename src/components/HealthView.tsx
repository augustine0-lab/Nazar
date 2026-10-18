import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";
import { LOCALE, type MsgKey } from "@/lib/i18n";

type Analysis = ReturnType<typeof D.sleepVsDay>;
interface Log {
  date: string;
  sleepHours: number | null;
  medication: string | null;
}

/** Diary entries and the sleep comparison, for the parent and the psychologist. */
export async function HealthView({ logs, analysis }: { logs: Log[]; analysis: Analysis }) {
  const { lang, t } = await getT();
  const enough = analysis.short.days >= 3 && analysis.enough.days >= 3;
  const fmtH = (h: number) => t("hl.hours", { h: h.toLocaleString(LOCALE[lang]) });
  return (
    <div className="stack">
      <h3>{t("hl.analysis")}</h3>
      {enough ? (
        <div className="stack" style={{ gap: 6 }}>
          <div className="stack" style={{ gap: 4 }}>
            <span className="small">{t("hl.short", { h: D.SHORT_SLEEP_HOURS, pct: D.pct(analysis.short.avg) ?? 0, n: analysis.short.days })}</span>
            <div className="bar"><i style={{ width: `${(analysis.short.avg ?? 0) * 100}%`, background: "var(--bad)" }} /></div>
          </div>
          <div className="stack" style={{ gap: 4 }}>
            <span className="small">{t("hl.enough", { h: D.SHORT_SLEEP_HOURS, pct: D.pct(analysis.enough.avg) ?? 0, n: analysis.enough.days })}</span>
            <div className="bar"><i style={{ width: `${(analysis.enough.avg ?? 0) * 100}%` }} /></div>
          </div>
        </div>
      ) : (
        <p className="muted">{t("hl.tooFew")}</p>
      )}
      <p className="muted small">{t("hl.caution")} {t("hl.medNote")}</p>

      <h3>{t("hl.log")}</h3>
      {logs.length ? (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{t("hl.date")}</th><th>{t("hl.sleep")}</th><th>{t("hl.med")}</th></tr></thead>
            <tbody>
              {logs.slice(0, 14).map((l) => (
                <tr key={l.date}>
                  <td className="num">{D.shortWeekday(l.date, lang)}, {D.formatDate(l.date, lang)}</td>
                  <td className="num">{l.sleepHours === null ? "—" : fmtH(l.sleepHours)}{l.sleepHours !== null && l.sleepHours < D.SHORT_SLEEP_HOURS ? " ⚠️" : ""}</td>
                  <td>{l.medication ? t(`hl.med.${l.medication}` as MsgKey) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">{t("hl.none")}</p>
      )}
    </div>
  );
}
