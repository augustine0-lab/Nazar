import Link from "next/link";
import { Shell } from "@/components/Shell";
import { ChildSwitch } from "@/components/ChildSwitch";
import { WeekStrip } from "@/components/WeekStrip";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as M from "@/lib/more-services";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";
import { LOCALE, type MsgKey } from "@/lib/i18n";

const TREND_ICON = { UP: "▲", DOWN: "▼", SAME: "＝" } as const;

/** One screen for the parent at the end of the week: what went well, what to talk about. */
export default async function ParentWeek({ searchParams }: { searchParams: Promise<{ child?: string; w?: string }> }) {
  const user = await requireUser("PARENT");
  const { lang, t, L } = await getT();
  const db = getDb();
  const sp = await searchParams;
  const { child, kids } = await pickChild(db, user, sp.child);
  const thisMonday = D.mondayOf(S.workDay());
  const monday = sp.w && /^\d{4}-\d{2}-\d{2}$/.test(sp.w) && sp.w <= thisMonday ? D.mondayOf(sp.w) : thisMonday;
  const link = (w: string) => `/parent/week?child=${child.id}&w=${w}`;

  if (!(await hasActiveConsent(db, child.id))) {
    return (
      <Shell current="/parent/week">
        <ChildSwitch kids={kids} current={child.id} base="/parent/week" />
        <section className="card warn"><p>{t("parent.needConsent.body")}</p></section>
      </Shell>
    );
  }

  const r = await M.weekReport(db, user, child.id, monday);
  const pct = (x: number | null) => (x === null ? "—" : `${D.pct(x)}%`);
  const one = (x: number) => x.toLocaleString(LOCALE[lang], { maximumFractionDigits: 1 });
  return (
    <Shell current="/parent/week">
      <ChildSwitch kids={kids} current={child.id} base="/parent/week" />
      <div className="row between">
        <div className="stack" style={{ gap: 2 }}>
          <h1>{t("wr.title", { name: child.displayName })}</h1>
          <span className="muted">{t("wr.range", { from: D.formatDate(monday, lang), to: D.formatDate(D.addDays(monday, 6), lang) })}</span>
        </div>
        <div className="row no-print">
          <Link className="btn quiet" href={link(D.addDays(monday, -7))}>{t("wr.prev")}</Link>
          {monday < thisMonday && <Link className="btn quiet" href={link(D.addDays(monday, 7))}>{t("wr.next")}</Link>}
        </div>
      </div>

      <div className="kpis">
        <section className="card kpi">
          <span className="eyebrow">{t("wr.days")}</span>
          <span className="big num">{t("wr.daysOf", { n: r.successDays, rated: r.ratedDays })}</span>
          <span className="muted small">{t("wr.lastWeek", { n: r.lastSuccessDays })}</span>
        </section>
        <section className="card kpi">
          <span className="eyebrow">{t("wr.stars")}</span>
          <span className="big num" style={{ color: "var(--star)" }}>★ {r.starsEarned}</span>
        </section>
        <section className="card kpi">
          <span className="eyebrow">{t("wr.schedule")}</span>
          <span className="big num">{r.schedule.planned ? `${r.schedule.done} / ${r.schedule.planned}` : "—"}</span>
        </section>
        <section className="card kpi">
          <span className="eyebrow">{t("wr.mood")}</span>
          <span className="big num">{r.mood.now === null ? "—" : t("wr.moodOf", { n: one(r.mood.now) })}</span>
          {r.mood.before !== null && <span className="muted small">{t("wr.lastWeek", { n: one(r.mood.before) })}</span>}
        </section>
      </div>

      <section className="card">
        <WeekStrip days={r.week} today={S.workDay()} />
      </section>

      <section className="card">
        <h2>{t("wr.goals")}</h2>
        {r.goals.length ? (
          <div className="stack">
            {r.goals.map(({ goal, now, trend }) => (
              <div key={goal.id} className="stack" style={{ gap: 4 }}>
                <div className="row between small">
                  <span>{L(goal.adultText)}</span>
                  <span className="num">
                    {pct(now)}
                    {trend && <span className={`trend ${trend.toLowerCase()}`}> {TREND_ICON[trend]} {t(`wr.trend.${trend}` as MsgKey)}</span>}
                    {now === null && <span className="muted"> {t("wr.noMarks")}</span>}
                  </span>
                </div>
                <div className="bar"><i style={{ width: `${(now ?? 0) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{t("wr.noPlan")}</p>
        )}
      </section>

      <section className="card">
        <h2>{t("wr.talk")}</h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          {r.best && <li>{t("wr.tipBest", { goal: L(r.best.goal.adultText) })}</li>}
          {r.hard.map((h) => <li key={h.goal.id}>{t("wr.tipHard", { goal: L(h.goal.adultText) })}</li>)}
          {!r.best && <li>{t("wr.tipNone")}</li>}
        </ul>
      </section>

      <section className="card">
        <h2>{t("wr.notes")}</h2>
        {r.notes.length ? (
          <div className="list">
            {r.notes.map((n, i) => (
              <p key={i} style={{ margin: 0 }}>
                <span className="muted small">{D.shortWeekday(n.date, lang)}, {D.formatDate(n.date, lang)} · {L(n.author)}</span><br />
                {L(n.text)}
              </p>
            ))}
          </div>
        ) : (
          <p className="muted">{t("wr.noNotes")}</p>
        )}
      </section>
    </Shell>
  );
}
