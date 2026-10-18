import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { MarkGrid } from "./MarkGrid";
import { saveNoteAction } from "@/app/actions";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";

const EVIDENCE_LABEL = { STRONG: "сильные данные", MODERATE: "средние данные", PRACTICE: "практика" } as const;

export default async function TeacherStudent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser("TEACHER");
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "VIEW", id))) notFound();
  const { student, cls, school } = await S.getStudent(db, id);
  const today = S.workDay();
  const prev = D.previousSchoolDay(today);
  const { date: qd } = await searchParams;
  const date = qd === prev ? prev : today;
  const canMark = await can(db, user, "MARK", id);
  const sum = await S.daySummary(db, id, date);
  const myNote = sum.notes.find((n) => n.note.authorId === user.id);
  const schoolGoals = sum.plan?.goals.filter((g) => g.place === "SCHOOL") ?? [];
  const lesson = date === S.today() ? D.currentLessonNo(school.bellSchedule, S.nowLocal()) : 1;

  return (
    <Shell current="/teacher">
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <Link href="/teacher" className="small">← Мой класс</Link>
          <h1>{student.displayName}</h1>
          <span className="muted">{cls.name}</span>
        </div>
        <nav className="row" aria-label="День">
          <Link className="btn" href={`/teacher/student/${id}?date=${prev}`} aria-current={date === prev ? "page" : undefined}>
            {D.shortWeekday(prev)}, {D.formatRuDate(prev)}
          </Link>
          <Link className="btn" href={`/teacher/student/${id}`} aria-current={date === today ? "page" : undefined}>
            {D.shortWeekday(today)}, {D.formatRuDate(today)}
          </Link>
        </nav>
      </div>

      {!canMark ? (
        <section className="card warn">
          <h2>Отметки недоступны</h2>
          <p>Родитель ещё не дал согласие на обработку данных ребёнка. Без согласия платформа не собирает наблюдения.</p>
        </section>
      ) : !schoolGoals.length ? (
        <section className="card warn">
          <h2>Нет согласованного плана</h2>
          <p>Психолог готовит план поддержки, отметки появятся после согласования с родителем.</p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="row between">
              <span className="eyebrow">Карточка поведения</span>
              <span className="muted small num">
                {sum.tally.ratio === null ? "отметок пока нет" : `${D.pct(sum.tally.ratio)}% целей, порог ${sum.plan!.thresholdPct}%`}
              </span>
            </div>
            <MarkGrid
              key={date}
              studentId={id}
              date={date}
              bell={school.bellSchedule}
              goals={schoolGoals.map((g) => ({ id: g.id, text: g.adultText }))}
              initialMarks={sum.marks.filter((m) => m.lessonNo > 0).map((m) => ({ goalId: m.goalId, lessonNo: m.lessonNo, value: m.value }))}
              initialLesson={lesson}
            />
            <p className="muted small">«—» значит, что цель не подходит к этому уроку или ребёнка не было. Такие уроки не входят в процент.</p>
          </section>

          <section className="card">
            <h2>Итог дня для родителя</h2>
            <ActionForm action={saveNoteAction} className="stack">
              <input type="hidden" name="studentId" value={id} />
              <input type="hidden" name="date" value={date} />
              <label>
                Заметка (что получилось, что было трудно)
                <textarea name="text" id="note" rows={3} defaultValue={myNote?.note.text ?? ""} maxLength={1000} placeholder="Например: сегодня хорошо работал в паре на математике" />
              </label>
              <div className="row">
                <button className="btn" name="intent" value="save" type="submit">Сохранить заметку</button>
                <button className="btn primary" name="intent" value="close" type="submit">Закрыть день</button>
                <span className="muted small">
                  {sum.closed ? "День закрыт, родитель видит итог." : `Незакрытый день закроется сам в ${D.DAY_AUTO_CLOSE_HOUR}:00.`}
                </span>
              </div>
            </ActionForm>
          </section>
        </>
      )}

      {sum.plan && sum.plan.techniques.length > 0 && (
        <section className="card">
          <h2>Приёмы из плана</h2>
          <div className="list">
            {sum.plan.techniques.map((t) => (
              <div key={t.id} className="stack" style={{ gap: 4 }}>
                <span className="row"><b>{t.title}</b><span className={`pill ${t.evidence === "STRONG" ? "good" : t.evidence === "MODERATE" ? "star" : ""}`}>{EVIDENCE_LABEL[t.evidence]}</span></span>
                <span className="muted small">{t.body}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
