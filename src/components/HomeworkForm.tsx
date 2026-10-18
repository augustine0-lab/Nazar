import { ActionForm } from "./ActionForm";
import { createHomeworkAction } from "@/app/actions";

export function HomeworkForm({ studentId, defaultDue }: { studentId: string; defaultDue: string }) {
  return (
    <ActionForm action={createHomeworkAction} className="stack">
      <input type="hidden" name="studentId" value={studentId} />
      <div className="form-grid">
        <label>Предмет<input name="subject" required placeholder="Математика" /></label>
        <label>Задание<input name="title" required placeholder="Учебник, с. 42" /></label>
        <label>Срок<input name="dueDate" type="date" defaultValue={defaultDue} required /></label>
      </div>
      <label>
        Шаги, каждый с новой строки (по 5–10 минут, до 12 шагов)
        <textarea name="steps" rows={5} required placeholder={"Открыть учебник на с. 42\nЗадача № 1\nЗадача № 2"} />
      </label>
      <button className="btn primary" type="submit">Добавить задание</button>
    </ActionForm>
  );
}
