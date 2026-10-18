import { ActionForm } from "./ActionForm";
import { proposeGoalAction } from "@/app/actions";
import { getDb } from "@/db";
import type { Actor } from "@/lib/access";
import * as M from "@/lib/more-services";
import { getT } from "@/lib/i18n/server";

/** A parent or teacher suggests a goal; the psychologist decides whether it goes into the plan. */
export async function ProposeGoal({ actor, studentId }: { actor: Actor; studentId: string }) {
  const { t, L } = await getT();
  const mine = await M.proposalsOf(getDb(), actor, studentId);
  const STATUS_CLASS = { PROPOSED: "", ADOPTED: "good", DISMISSED: "bad" } as const;
  return (
    <div className="stack">
      <p className="muted small">{t("prop.hint")}</p>
      <ActionForm action={proposeGoalAction} className="stack">
        <input type="hidden" name="studentId" value={studentId} />
        <div className="form-grid">
          <label>{t("prop.adult")}<input name="adultText" maxLength={120} placeholder={t("prop.adultExample")} required /></label>
          <label>{t("prop.child")}<input name="childText" maxLength={80} placeholder={t("prop.childExample")} required /></label>
          <label>
            {t("prop.where")}
            <select name="place" defaultValue={actor.role === "PARENT" ? "HOME" : "SCHOOL"}>
              <option value="SCHOOL">{t("pe.school")}</option>
              <option value="HOME">{t("pe.home")}</option>
            </select>
          </label>
        </div>
        <label>{t("prop.reason")}<input name="reason" maxLength={300} /></label>
        <div><button className="btn primary" type="submit">{t("prop.send")}</button></div>
      </ActionForm>
      {mine.length > 0 && (
        <>
          <h3>{t("prop.mine")}</h3>
          <div className="list">
            {mine.map(({ p }) => (
              <div key={p.id} className="row between">
                <span>{L(p.adultText)}</span>
                <span className={`pill ${STATUS_CLASS[p.status]}`}>{t(`prop.status.${p.status}`)}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
