import Link from "next/link";
import { Shell } from "@/components/Shell";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import { hasActiveConsent } from "@/lib/access";
import * as S from "@/lib/services";
import { formatRuDate, pct } from "@/lib/domain";

export default async function TeacherHome() {
  const user = await requireUser("TEACHER");
  const db = getDb();
  const day = S.workDay();
  const kids = await S.studentsForActor(db, user);
  const rows = await Promise.all(
    kids.map(async (k) => {
      const [sum, consent, { school }] = await Promise.all([S.daySummary(db, k.id, day), hasActiveConsent(db, k.id), S.getStudent(db, k.id)]);
      const schoolGoals = sum.plan?.goals.filter((g) => g.place === "SCHOOL") ?? [];
      const lessonsDone = school.bellSchedule.filter((_, i) =>
        schoolGoals.length > 0 && schoolGoals.every((g) => sum.marks.some((m) => m.goalId === g.id && m.lessonNo === i + 1)),
      ).length;
      return { ...k, sum, consent, lessonsDone, lessons: school.bellSchedule.length, hasPlan: schoolGoals.length > 0 };
    }),
  );
  return (
    <Shell current="/teacher">
      <div className="row between">
        <h1>Мой класс</h1>
        <span className="muted">{formatRuDate(day)}</span>
      </div>
      <section className="card">
        <p className="muted small">Здесь только дети с планом поддержки. Одноклассники не видят, у кого он есть.</p>
        <div className="list">
          {rows.map((r) => (
            <Link key={r.id} href={`/teacher/student/${r.id}`} className="list-link">
              <span className="stack" style={{ gap: 2 }}>
                <b>{r.displayName}</b>
                <span className="muted small">{r.className}</span>
              </span>
              <span className="row">
                {!r.consent ? (
                  <span className="pill star">нет согласия родителя</span>
                ) : !r.hasPlan ? (
                  <span className="pill">план не согласован</span>
                ) : (
                  <>
                    <span className="pill num">уроков отмечено: {r.lessonsDone} из {r.lessons}</span>
                    {r.sum.tally.ratio !== null && <span className={`pill num ${r.sum.success ? "good" : ""}`}>{pct(r.sum.tally.ratio)}%</span>}
                  </>
                )}
              </span>
            </Link>
          ))}
          {!rows.length && <p className="muted">В вашем классе пока нет детей с планом поддержки.</p>}
        </div>
      </section>
    </Shell>
  );
}
