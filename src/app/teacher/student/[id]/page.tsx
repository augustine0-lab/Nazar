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
import { getT } from "@/lib/i18n/server";

export default async function TeacherStudent({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ date?: string }> }) {
  const user = await requireUser("TEACHER");
  const { lang, t, L } = await getT();
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
          <Link href="/teacher" className="small">← {t("nav.myClass")}</Link>
          <h1>{student.displayName}</h1>
          <span className="muted">{cls.name}</span>
        </div>
        <nav className="row" aria-label={t("tc.dayNav")}>
          <Link className="btn" href={`/teacher/student/${id}?date=${prev}`} aria-current={date === prev ? "page" : undefined}>
            {D.shortWeekday(prev, lang)}, {D.formatDate(prev, lang)}
          </Link>
          <Link className="btn" href={`/teacher/student/${id}`} aria-current={date === today ? "page" : undefined}>
            {D.shortWeekday(today, lang)}, {D.formatDate(today, lang)}
          </Link>
        </nav>
      </div>

      {!canMark ? (
        <section className="card warn">
          <h2>{t("tc.unavailable")}</h2>
          <p>{t("tc.unavailableBody")}</p>
        </section>
      ) : !schoolGoals.length ? (
        <section className="card warn">
          <h2>{t("tc.noPlan")}</h2>
          <p>{t("tc.noPlanBody")}</p>
        </section>
      ) : (
        <>
          <section className="card">
            <div className="row between">
              <span className="eyebrow">{t("tc.card")}</span>
              <span className="muted small num">
                {sum.tally.ratio === null ? t("tc.noMarks") : t("tc.pctGoals", { pct: D.pct(sum.tally.ratio) ?? 0, th: sum.plan!.thresholdPct })}
              </span>
            </div>
            <MarkGrid
              key={date}
              studentId={id}
              date={date}
              bell={school.bellSchedule}
              goals={schoolGoals.map((g) => ({ id: g.id, text: L(g.adultText) }))}
              initialMarks={sum.marks.filter((m) => m.lessonNo > 0).map((m) => ({ goalId: m.goalId, lessonNo: m.lessonNo, value: m.value }))}
              initialLesson={lesson}
            />
            <p className="muted small">{t("tc.naHint")}</p>
          </section>

          <section className="card">
            <h2>{t("tc.noteTitle")}</h2>
            <ActionForm action={saveNoteAction} className="stack">
              <input type="hidden" name="studentId" value={id} />
              <input type="hidden" name="date" value={date} />
              <label>
                {t("tc.noteLabel")}
                <textarea name="text" id="note" rows={3} defaultValue={myNote ? L(myNote.note.text) : ""} maxLength={1000} placeholder={t("tc.notePlaceholder")} />
              </label>
              <div className="row">
                <button className="btn" name="intent" value="save" type="submit">{t("tc.saveNote")}</button>
                <button className="btn primary" name="intent" value="close" type="submit">{t("tc.closeDay")}</button>
                <span className="muted small">
                  {sum.closed ? t("tc.dayClosed") : t("tc.autoClose", { h: D.DAY_AUTO_CLOSE_HOUR })}
                </span>
              </div>
            </ActionForm>
          </section>
        </>
      )}

      {sum.plan && sum.plan.techniques.length > 0 && (
        <section className="card">
          <h2>{t("tc.planTechniques")}</h2>
          <div className="list">
            {sum.plan.techniques.map((tq) => (
              <div key={tq.id} className="stack" style={{ gap: 4 }}>
                <span className="row"><b>{L(tq.title)}</b><span className={`pill ${tq.evidence === "STRONG" ? "good" : tq.evidence === "MODERATE" ? "star" : ""}`}>{t(`ev.${tq.evidence}`)}</span></span>
                <span className="muted small">{L(tq.body)}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </Shell>
  );
}
