import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { GoalChart } from "@/components/GoalChart";
import { PrintButton } from "@/components/PrintButton";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { HOME_BY_ROLE, requireUser } from "@/lib/session";
import * as F from "@/lib/feature-services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

/** A one-page summary for a specialists' meeting or a parents' meeting. The browser's print dialog saves it as PDF. */
export default async function Report({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("PSYCHOLOGIST", "PARENT");
  const { lang, t, L } = await getT();
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "VIEW_REPORT", id))) notFound();
  const r = await F.reportData(db, user, id);
  const plan = r.current;
  const back = user.role === "PSYCHOLOGIST" ? `/psych/student/${id}` : `/parent?child=${id}`;

  return (
    <Shell current={HOME_BY_ROLE[user.role]}>
      <div className="no-print stack">
        <Link href={back} className="small">{t("rp.back")}</Link>
        <PrintButton />
      </div>
      <article className="report">
        <header className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{t("rp.forWhom")}</span>
          <h1>{t("rp.title")}: {r.student.displayName}</h1>
          <span className="muted">
            {t("rp.school", { school: L(r.school.name), cls: r.cls.name })}
            {r.student.birthYear ? t("ps.birth", { year: r.student.birthYear }) : ""}
          </span>
          <span className="muted small">{t("rp.generated", { date: D.formatDate(r.generatedOn, lang) })}</span>
        </header>

        <h2>{t("rp.plan")}</h2>
        {plan ? (
          <>
            <p>{t("rp.planInfo", { v: plan.version, date: D.formatDate(plan.effectiveFrom!, lang), th: plan.thresholdPct, work: plan.workMinutes, brk: plan.breakMinutes })}</p>
            <h3>{t("rp.goals")}</h3>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {plan.goals.map((g) => <li key={g.id}>{L(g.adultText)} <span className="muted">({t(`plan.place.${g.place}`)})</span></li>)}
            </ul>
          </>
        ) : (
          <p className="muted">{t("rp.noPlan")}</p>
        )}

        <h2>{t("ps.dynamics")}</h2>
        {r.series.goals.length ? (
          <GoalChart goals={r.series.goals.map((g) => ({ ...g, adultText: L(g.adultText) }))} weeks={r.series.weeks} threshold={plan?.thresholdPct ?? 70} />
        ) : (
          <p className="muted">{t("ps.noData")}</p>
        )}

        <h2>{t("rp.weeks")}</h2>
        <ul style={{ margin: 0, paddingLeft: 20 }}>
          {r.weeks.map((w) => <li key={w.monday} className="num">{t("rp.weekRow", { date: D.formatDate(w.monday, lang), success: w.success, rated: w.rated })}</li>)}
        </ul>

        <h2>{t("ps.selfChecksTitle")}</h2>
        <p className="num">{t("rp.self", { on: r.selfChecks.on, n: r.selfChecks.n })}</p>
        {r.moodAverage !== null && <p className="num">{t("rp.mood", { n: r.moodAverage, c: r.moodCount })}</p>}

        {r.techniques.length > 0 && (
          <>
            <h2>{t("rp.techniques")}</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {r.techniques.map((tq) => <li key={tq.id}><b>{L(tq.title)}</b> ({t(`ev.${tq.evidence}`)})</li>)}
            </ul>
          </>
        )}

        {r.notes.length > 0 && (
          <>
            <h2>{t("rp.notes")}</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {r.notes.map((n, i) => <li key={i}>{D.formatDate(n.date, lang)}, {L(n.author)} ({t(`role.${n.role}`)}): {L(n.text)}</li>)}
            </ul>
          </>
        )}

        {r.scales.length > 0 && (
          <>
            <h2>{t("rp.scales")}</h2>
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {r.scales.map((s) => (
                <li key={s.id}>
                  {t("sc.by", { name: L(s.respondentName), role: t(`role.${s.respondentRole}`), date: D.formatDate(s.date, lang) })}. {" "}
                  {t("sc.score", { a: s.score.inattention.sum, ac: s.score.inattention.concerns, h: s.score.hyperactivity.sum, hc: s.score.hyperactivity.concerns })}
                </li>
              ))}
            </ul>
          </>
        )}

        <p className="muted small">{t("rp.disclaimer")}</p>
      </article>
    </Shell>
  );
}
