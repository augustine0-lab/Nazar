import Link from "next/link";
import { Shell } from "@/components/Shell";
import { StarRow } from "@/components/Stars";
import { HomeworkForm } from "@/components/HomeworkForm";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { myStudent } from "@/lib/me";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";

export default async function StudentHome() {
  const user = await requireUser("STUDENT");
  const db = getDb();
  const me = await myStudent(db, user);
  if (!(await hasActiveConsent(db, me.id))) {
    return (
      <Shell current="/student">
        <section className="card child"><h1>Привет, {me.displayName.split(" ")[0]}!</h1><p>Скоро здесь появятся твои звёзды и задания.</p></section>
      </Shell>
    );
  }
  const day = S.workDay();
  const [st, rewards, hw, plan] = await Promise.all([S.stars(db, me.id, day), S.rewardsOf(db, me.id), S.homeworkOf(db, me.id, S.today()), S.planFor(db, me.id, day)]);
  const affordable = rewards.filter((r) => r.cost <= st.balance).at(-1);
  const next = rewards.find((r) => r.cost > st.balance);
  const lessonGoals = plan?.goals ?? [];

  return (
    <Shell current="/student">
      <div className="child stack">
        <h1>Привет, {me.displayName.split(" ")[0]}!</h1>

        <section className="card">
          <span className="eyebrow">Мои звёзды {day === S.today() ? "сегодня" : "за " + D.formatRuDate(day)}</span>
          <StarRow lit={st.earnedToday} total={Math.max(10, st.earnedToday)} />
          <div className="goalcard">
            Всего звёзд: <b className="num">{st.balance}</b>.{" "}
            {affordable ? <>Уже хватает на «{affordable.title}». <Link href="/student/rewards">Попросить</Link></> : next ? <>До «{next.title}» осталось {next.cost - st.balance}.</> : null}
          </div>
        </section>

        {lessonGoals.length > 0 && (
          <section className="card">
            <h2>Мои цели</h2>
            <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
              {lessonGoals.map((g) => <li key={g.id}>{g.childText}</li>)}
            </ul>
          </section>
        )}

        <section className="card">
          <h2>Домашка</h2>
          <div className="list">
            {hw.map((h) => {
              const done = h.steps.filter((s) => s.doneAt).length;
              return (
                <Link key={h.id} href={`/student/homework/${h.id}`} className="list-link">
                  <span><b>{h.subject}</b> · {h.title}</span>
                  <span className={`pill ${done === h.steps.length ? "good" : ""}`}>{done === h.steps.length ? "готово" : `${done} из ${h.steps.length}`}</span>
                </Link>
              );
            })}
            {!hw.length && <p className="muted">Заданий нет. Можно отдыхать!</p>}
          </div>
          <details>
            <summary className="muted small">Добавить задание самому</summary>
            <div style={{ marginTop: 12 }}><HomeworkForm studentId={me.id} defaultDue={D.nextSchoolDay(S.today())} /></div>
          </details>
        </section>
      </div>
    </Shell>
  );
}
