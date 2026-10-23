import { ActionForm } from "./ActionForm";
import { startTrialAction } from "@/app/actions";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

/** The psychologist picks one technique, the goal to watch and how long to try it. */
export async function TrialStart({ studentId, techniques, goals }: { studentId: string; techniques: { id: string; title: string }[]; goals: { lineageId: string; text: string }[] }) {
  const { t, L } = await getT();
  return (
    <ActionForm action={startTrialAction} className="stack">
      <input type="hidden" name="studentId" value={studentId} />
      <label>{t("tr.technique")}
        <select name="techniqueId" required>{techniques.map((tq) => <option key={tq.id} value={tq.id}>{L(tq.title)}</option>)}</select>
      </label>
      <label>{t("tr.goal")}
        <select name="lineageId" defaultValue="">
          <option value="">{t("tr.goalAllOption")}</option>
          {goals.map((g) => <option key={g.lineageId} value={g.lineageId}>{L(g.text)}</option>)}
        </select>
      </label>
      <label>{t("tr.length")}
        <select name="days" defaultValue={D.DEFAULT_TRIAL_DAYS}>
          {D.TRIAL_LENGTHS.map((n) => <option key={n} value={n}>{t("tr.days", { n })}</option>)}
        </select>
      </label>
      <label>{t("tr.howTo")}<textarea name="howTo" maxLength={300} rows={2} placeholder={t("tr.howToPh")} /></label>
      <p className="muted small">{t("tr.startHint", { n: D.BASELINE_DAYS })}</p>
      <button className="btn primary" type="submit">{t("tr.start")}</button>
    </ActionForm>
  );
}
