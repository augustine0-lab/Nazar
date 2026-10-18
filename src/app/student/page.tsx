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
import { getT } from "@/lib/i18n/server";

export default async function StudentHome() {
  const user = await requireUser("STUDENT");
  const { lang, t, L } = await getT();
  const db = getDb();
  const me = await myStudent(db, user);
  if (!(await hasActiveConsent(db, me.id))) {
    return (
      <Shell current="/student">
        <section className="card child"><h1>{t("st.hello", { name: me.displayName.split(" ")[0] })}</h1><p>{t("st.soon")}</p></section>
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
        <h1>{t("st.hello", { name: me.displayName.split(" ")[0] })}</h1>

        <section className="card">
          <span className="eyebrow">{day === S.today() ? t("st.starsToday") : t("st.starsDay", { date: D.formatDate(day, lang) })}</span>
          <StarRow lit={st.earnedToday} total={Math.max(10, st.earnedToday)} />
          <div className="goalcard">
            {t("st.total")} <b className="num">{st.balance}</b>.{" "}
            {affordable ? <>{t("st.canAfford", { title: L(affordable.title) })} <Link href="/student/rewards">{t("st.ask")}</Link></> : next ? <>{t("st.untilNext", { title: L(next.title), n: next.cost - st.balance })}</> : null}
          </div>
        </section>

        {lessonGoals.length > 0 && (
          <section className="card">
            <h2>{t("st.myGoals")}</h2>
            <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
              {lessonGoals.map((g) => <li key={g.id}>{L(g.childText)}</li>)}
            </ul>
          </section>
        )}

        <section className="card">
          <h2>{t("st.homework")}</h2>
          <div className="list">
            {hw.map((h) => {
              const done = h.steps.filter((s) => s.doneAt).length;
              return (
                <Link key={h.id} href={`/student/homework/${h.id}`} className="list-link">
                  <span><b>{L(h.subject)}</b> · {L(h.title)}</span>
                  <span className={`pill ${done === h.steps.length ? "good" : ""}`}>{done === h.steps.length ? t("st.done") : t("st.progress", { done, n: h.steps.length })}</span>
                </Link>
              );
            })}
            {!hw.length && <p className="muted">{t("st.noHw")}</p>}
          </div>
          <details>
            <summary className="muted small">{t("st.addSelf")}</summary>
            <div style={{ marginTop: 12 }}><HomeworkForm studentId={me.id} defaultDue={D.nextSchoolDay(S.today())} /></div>
          </details>
        </section>
      </div>
    </Shell>
  );
}
