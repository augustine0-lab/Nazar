import { ActionForm } from "./ActionForm";
import { TrialChart } from "./TrialChart";
import { extendTrialAction, finishTrialAction } from "@/app/actions";
import type { TrialView } from "@/lib/concept-services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

const VERDICT_PILL: Record<D.TrialVerdict, string> = { NOT_ENOUGH: "", BETTER: "good", MIXED: "star", WORSE: "bad", NO_CHANGE: "" };
const pctOrDash = (r: number | null) => (r === null ? "—" : `${Math.round(r * 100)}%`);

/** One trial: what is being tried, the before/during graph, the comparison and, for its owner, the decision. */
export async function TrialCard({ v, manage, compact = false }: { v: TrialView; manage: boolean; compact?: boolean }) {
  const { lang, t, L } = await getT();
  const { trial, technique, result } = v;
  const running = trial.status === "RUNNING";
  return (
    <div className="stack">
      <div className="row between">
        <b>{L(technique.title)}</b>
        {running ? (
          <span className="pill num">{v.ended ? t("tr.ended") : t("tr.dayOf", { n: v.dayNo, total: v.schoolDays })}</span>
        ) : (
          <span className={`pill ${trial.decision === "KEEP" ? "good" : ""}`}>{t(`tr.decision.${trial.decision ?? "DROP"}`)}</span>
        )}
      </div>
      <span className="muted small">
        {t("tr.dates", { from: D.formatDate(trial.startDate, lang), to: D.formatDate(trial.endDate, lang) })} · {v.goal ? t("tr.goalOne", { goal: L(v.goal) }) : t("tr.goalAll")}
      </span>
      {trial.howTo && <p><span className="muted small">{t("tr.howTo")}:</span> {L(trial.howTo)}</p>}
      {!compact && <TrialChart before={v.before} during={v.during} beforeMean={result.before.mean} duringMean={result.during.mean} />}
      <div className="row">
        <span className="num">{t("tr.compare", { a: pctOrDash(result.before.mean), b: pctOrDash(result.during.mean), da: result.before.days, db: result.during.days })}</span>
        <span className={`pill ${VERDICT_PILL[result.verdict]}`}>{t(`tr.verdict.${result.verdict}`)}</span>
      </div>
      {!compact && result.pem !== null && result.verdict !== "NOT_ENOUGH" && (
        <span className="muted small num">{t("tr.pem", { p: Math.round(result.pem * 100) })}</span>
      )}
      {trial.conclusion && <p className="msg ok">{L(trial.conclusion)}</p>}
      {!compact && <p className="muted small">{t("tr.caution")}</p>}
      {manage && running && (
        <details>
          <summary className="btn">{t("tr.finishOpen")}</summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <ActionForm action={finishTrialAction} className="stack">
              <input type="hidden" name="studentId" value={trial.studentId} />
              <input type="hidden" name="trialId" value={trial.id} />
              <fieldset className="stack">
                <legend>{t("tr.decide")}</legend>
                <label className="check"><input type="radio" name="decision" value="KEEP" required /> {t("tr.keep")}</label>
                <label className="check"><input type="radio" name="decision" value="DROP" /> {t("tr.drop")}</label>
              </fieldset>
              <label>{t("tr.conclusion")}<textarea name="conclusion" maxLength={300} rows={2} placeholder={t("tr.conclusionPh")} /></label>
              <button className="btn primary" type="submit">{t("tr.finish")}</button>
            </ActionForm>
            <ActionForm action={extendTrialAction}>
              <input type="hidden" name="studentId" value={trial.studentId} />
              <input type="hidden" name="trialId" value={trial.id} />
              <button className="btn" type="submit">{t("tr.extend", { n: D.TRIAL_EXTEND_DAYS })}</button>
            </ActionForm>
          </div>
        </details>
      )}
    </div>
  );
}
