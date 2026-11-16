import { ActionForm } from "./ActionForm";
import { createHomeworkAction } from "@/app/actions";
import { getT } from "@/lib/i18n/server";
import { EST_MAX, EST_MIN } from "@/lib/domain";
import { PhotoSteps } from "@/components/ai/PhotoSteps";
import type { AiGate } from "@/lib/ai-services";

/** ai: whether this adult may fill the form from a photo of the task (see ai-services aiGate). */
export async function HomeworkForm({ studentId, defaultDue, ai }: { studentId: string; defaultDue: string; ai?: AiGate }) {
  const { t } = await getT();
  return (
    <ActionForm action={createHomeworkAction} className="stack">
      <input type="hidden" name="studentId" value={studentId} />
      {ai === "OK" && <PhotoSteps studentId={studentId} />}
      {ai === "NO_CONSENT" && <p className="ai-note offline"><span aria-hidden="true">✦</span> {t("ai.gate.NO_CONSENT")}</p>}
      <div className="form-grid">
        <label>{t("hw.subject")}<input name="subject" required placeholder={t("hw.subjectExample")} /></label>
        <label>{t("hw.task")}<input name="title" required placeholder={t("hw.taskExample")} /></label>
        <label>{t("hw.due")}<input name="dueDate" type="date" defaultValue={defaultDue} required /></label>
        <label>{t("hw.est")}<input name="estMinutes" type="number" inputMode="numeric" min={EST_MIN} max={EST_MAX} step={5} placeholder={t("hw.estPh")} /></label>
      </div>
      <label>
        {t("hw.steps")}
        <textarea name="steps" rows={5} required placeholder={t("hw.stepsExample")} />
      </label>
      <button className="btn primary" type="submit">{t("hw.add")}</button>
    </ActionForm>
  );
}
