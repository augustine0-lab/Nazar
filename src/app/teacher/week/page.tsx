import Link from "next/link";
import { Shell } from "@/components/Shell";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as F from "@/lib/feature-services";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function TeacherWeek({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requireUser("TEACHER");
  const { lang, t, L } = await getT();
  const thisMonday = D.mondayOf(S.workDay());
  const asked = (await searchParams).week;
  // Any date in the week is accepted; weeks in the future are not.
  const monday = asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) && D.mondayOf(asked) <= thisMonday ? D.mondayOf(asked) : thisMonday;
  const rows = await F.classWeek(getDb(), user, monday);
  const friday = D.addDays(monday, 4);

  return (
    <Shell current="/teacher/week">
      <div className="row between">
        <h1>{t("wk.title")}</h1>
        <span className="muted">{D.formatDate(monday, lang)} – {D.formatDate(friday, lang)}</span>
      </div>
      <nav className="row" aria-label={t("wk.title")}>
        <Link className="btn" href={`/teacher/week?week=${D.addDays(monday, -7)}`}>{t("wk.prev")}</Link>
        {monday < thisMonday && <Link className="btn" href={`/teacher/week?week=${D.addDays(monday, 7)}`}>{t("wk.next")}</Link>}
      </nav>

      {rows.map((r) => (
        <section key={r.id} className="card">
          <div className="row between">
            <h2>{r.displayName}</h2>
            <Link href={`/teacher/student/${r.id}`} className="small">{t("wk.open")}</Link>
          </div>
          {!r.consent ? (
            <p className="muted">{t("wk.noConsent")}</p>
          ) : !r.plan ? (
            <p className="muted">{t("wk.noPlan")}</p>
          ) : (
            <>
              <div className="weekrow" role="list">
                {r.week.map((d) => (
                  <div key={d.date} role="listitem" className={`cell ${d.success ? "success" : d.tally.ratio !== null ? "bad" : ""}`}>
                    {D.shortWeekday(d.date, lang)}
                    <b>{d.tally.ratio === null ? "—" : `${D.pct(d.tally.ratio)}%`}</b>
                  </div>
                ))}
              </div>
              {r.ratedDays === 0 ? (
                <p className="muted">{t("wk.noData")}</p>
              ) : (
                <p className="num">{t("wk.days", { n: r.successDays, total: r.ratedDays })}</p>
              )}
              {r.ratedDays > 0 && r.struggling.length === 0 && <p className="muted small">{t("wk.allGood")}</p>}
              {r.struggling.map((s) => (
                <div key={s.goalId} className="msg" style={{ background: "var(--star-soft)" }}>
                  <b>{t("wk.struggle", { goal: L(s.goal.adultText), n: s.badDays, rated: s.ratedDays })}</b>
                </div>
              ))}
              {r.struggling.length > 0 && (
                <div className="stack">
                  <span className="muted small">{t("wk.try")}</span>
                  <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
                    {r.hints.map((h) => (
                      <li key={h.id}><b>{L(h.title)}</b>: <span className="muted small">{L(h.body)}</span></li>
                    ))}
                  </ul>
                  <p className="muted small">{t("wk.askPsych")} <Link href={`/chat/${r.id}`}>{t("chat.open")}</Link></p>
                </div>
              )}
            </>
          )}
        </section>
      ))}
      {!rows.length && <p className="muted">{t("tc.empty")}</p>}
    </Shell>
  );
}
