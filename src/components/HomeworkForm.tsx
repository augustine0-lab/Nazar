import { ActionForm } from "./ActionForm";
import { createHomeworkAction } from "@/app/actions";
import { getT } from "@/lib/i18n/server";

export async function HomeworkForm({ studentId, defaultDue }: { studentId: string; defaultDue: string }) {
  const { t } = await getT();
  return (
    <ActionForm action={createHomeworkAction} className="stack">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="form-grid">
        <label>{t("hw.subject")}<input name="subject" required placeholder={t("hw.subjectExample")} /></label>
        <label>{t("hw.task")}<input name="title" required placeholder={t("hw.taskExample")} /></label>
        <label>{t("hw.due")}<input name="dueDate" type="date" defaultValue={defaultDue} required /></label>
      </div>
      <label>
        {t("hw.steps")}
        <textarea name="steps" rows={5} required placeholder={t("hw.stepsExample")} />
      </label>
      <button className="btn primary" type="submit">{t("hw.add")}</button>
    </ActionForm>
  );
}
