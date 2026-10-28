import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { GoalChart } from "@/components/GoalChart";
import { PlanEditor } from "./PlanEditor";
import { MoodStrip } from "@/components/MoodStrip";
import { ScheduleEditor } from "@/components/ScheduleEditor";
import * as F from "@/lib/feature-services";
import * as M from "@/lib/more-services";
import { HealthView } from "@/components/HealthView";
import { BagEditor } from "@/components/BagEditor";
import { TrialCard } from "@/components/TrialCard";
import { TrialStart } from "@/components/TrialStart";
import * as C from "@/lib/concept-services";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function PsychStudent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("PSYCHOLOGIST");
  const { lang, t, L } = await getT();
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "VIEW", id))) notFound();
  const { student, cls } = await S.getStudent(db, id);
  const canEdit = await can(db, user, "EDIT_PLAN", id);
  const [moods, scales, schedule, series, plans, techniques, checks, proposals, health, bag, tried] = await Promise.all([
    F.moodsOf(db, id, D.addDays(S.today(), -6)),
    F.scalesOf(db, user, id),
    canEdit ? F.scheduleOf(db, id) : Promise.resolve([]),
    S.goalSeries(db, id, 6),
    S.plansOf(db, id),
    S.allTechniques(db),
    S.selfChecksOf(db, id, D.addDays(S.today(), -14)),
    canEdit ? M.proposalsOf(db, user, id) : Promise.resolve([]),
    canEdit ? M.healthOf(db, user, id) : Promise.resolve(null),
    canEdit ? M.bagFor(db, id, S.today()) : Promise.resolve(null),
    canEdit ? C.trialsOf(db, user, id) : Promise.resolve([]),
  ]);
  const running = tried.find((x) => x.trial.status === "RUNNING");
  const done = tried.filter((x) => x.trial.status === "DONE");
  const current = D.planForDate(plans, S.today());
  const base = plans.find((p) => p.status === "PENDING") ?? plans.find((p) => p.status === "ACTIVE") ?? current ?? null;
  const hints = series.goals
    .map((g, i) => ({ g, s: D.goalSuggestion(series.weeks.slice(0, -1).map((w) => w.ratios[i])) }))
    .filter((x) => x.s);

  return (
    <Shell current="/psych">
      <div className="stack" style={{ gap: 2 }}>
        <Link href="/psych" className="small">{t("ps.back")}</Link>
        <h1>{student.displayName}</h1>
        <span className="muted">{cls.name}{student.birthYear ? t("ps.birth", { year: student.birthYear }) : ""}</span>
      </div>

      <section className="card">
        <div className="row between"><h2>{t("ps.dynamics")}</h2><span className="eyebrow">{t("ps.share")}</span></div>
        {series.goals.length ? <GoalChart goals={series.goals.map((g) => ({ ...g, adultText: L(g.adultText) }))} weeks={series.weeks} threshold={current?.thresholdPct ?? base?.thresholdPct ?? 70} /> : <p className="muted">{t("ps.noData")}</p>}
        {hints.map(({ g, s }) => (
          <p key={g.id} className="msg" style={{ background: "var(--star-soft)" }}>
            {s === "RAISE"
              ? t("ps.hintRaise", { goal: L(g.adultText), n: D.RAISE_BAR * 100 })
              : t("ps.hintSimplify", { goal: L(g.adultText), n: D.SIMPLIFY_BAR * 100 })}
          </p>
        ))}
      </section>

      {canEdit && (
        <section className="card" id="trial">
          <div className="row between"><h2>{t("tr.title")}</h2><span className="eyebrow">{t("tr.eyebrow")}</span></div>
          <p className="muted small">{t("tr.lead")}</p>
          {running ? (
            <TrialCard v={running} manage />
          ) : (
            <TrialStart
              studentId={id}
              techniques={techniques.map((tq) => ({ id: tq.id, title: tq.title }))}
              goals={(current?.goals ?? []).filter((g) => g.place === "SCHOOL").map((g) => ({ lineageId: g.lineageId, text: g.adultText }))}
            />
          )}
          {done.length > 0 && (
            <details>
              <summary><b>{t("tr.history", { n: done.length })}</b></summary>
              <div className="list" style={{ marginTop: 12 }}>
                {done.map((v) => <TrialCard key={v.trial.id} v={v} manage={false} />)}
              </div>
            </details>
          )}
        </section>
      )}

      <section className="card">
        <div className="row">
          <Link className="btn" href={`/report/${id}`}>{t("rp.link")}</Link>
          <Link className="btn" href={`/passport/${id}`}>{t("pp.link")}</Link>
          <Link className="btn" href={`/chat/${id}`}>{t("chat.open")}</Link>
          {canEdit && <Link className="btn" href={`/stories/${id}`}>{t("story.manage")}</Link>}
        </div>
      </section>

      <section className="card"><MoodStrip moods={moods} today={S.today()} /></section>

      <section className="card">
        <h2>{t("sc.results")}</h2>
        {scales.length ? (
          <div className="list">
            {scales.map((sc) => (
              <div key={sc.id} className="stack" style={{ gap: 4 }}>
                <b>{t("sc.by", { name: L(sc.respondentName), role: t(`role.${sc.respondentRole}`), date: D.formatDate(sc.date, lang) })}</b>
                <span className="num">{t("sc.score", { a: sc.score.inattention.sum, ac: sc.score.inattention.concerns, h: sc.score.hyperactivity.sum, hc: sc.score.hyperactivity.concerns })}</span>
                <span className={`pill ${sc.score.inattention.flagged || sc.score.hyperactivity.flagged ? "star" : ""}`} style={{ alignSelf: "flex-start" }}>
                  {sc.score.inattention.flagged || sc.score.hyperactivity.flagged ? t("sc.flag") : t("sc.noFlag")}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{t("sc.none")}</p>
        )}
        <p className="muted small">{t("sc.disclaimer")}</p>
      </section>

      <section className="card">
        <h2>{t("ps.selfChecksTitle")}</h2>
        <p className="num">
          {checks.length
            ? t("ps.selfChecksPct", { n: checks.length, on: checks.filter((c) => c.onTask).length, p: Math.round((checks.filter((c) => c.onTask).length / checks.length) * 100) })
            : t("ps.selfChecks", { n: 0, on: 0 })}
        </p>
      </section>

      {canEdit ? (
        <section className="card">
          <h2>{t("ps.editor")}</h2>
          <p className="muted small">{t("ps.editorHint")}</p>
          <PlanEditor
            studentId={id}
            proposals={proposals.map(({ p, author, role }) => ({
              id: p.id,
              adultText: L(p.adultText),
              childText: L(p.childText),
              place: p.place,
              reason: L(p.reason),
              from: t("prop.from", { name: L(author), role: t(`role.${role}`) }),
            }))}
            techniques={techniques.map((tq) => ({ id: tq.id, title: L(tq.title), evidence: tq.evidence }))}
            initial={{
              thresholdPct: base?.thresholdPct ?? 70,
              workMinutes: base?.workMinutes ?? 10,
              breakMinutes: base?.breakMinutes ?? 3,
              goals: base?.goals.map((g) => ({ adultText: L(g.adultText), childText: L(g.childText), place: g.place, lineageId: g.lineageId })) ?? [{ adultText: "", childText: "", place: "SCHOOL", lineageId: null }],
              techniqueIds: base?.techniques.map((tq) => tq.id) ?? [],
            }}
          />
        </section>
      ) : (
        <section className="card warn"><p>{t("ps.editBlocked")}</p></section>
      )}

      {canEdit && (
        <section className="card">
          <h2>{t("hl.title")}</h2>
          {health ? <HealthView logs={health.logs} analysis={health.analysis} /> : <p className="muted">{t("hl.off")}</p>}
        </section>
      )}

      {canEdit && (
        <section className="card">
          <details>
            <summary><h2 style={{ display: "inline" }}>🎒 {t("bag.editor")}</h2></summary>
            <div style={{ marginTop: 12 }}><BagEditor studentId={id} items={bag?.items ?? []} /></div>
          </details>
        </section>
      )}

      {canEdit && (
        <section className="card">
          <details>
            <summary><h2 style={{ display: "inline" }}>{t("sch.editor")}</h2></summary>
            <div style={{ marginTop: 12 }}><ScheduleEditor studentId={id} items={schedule} /></div>
          </details>
        </section>
      )}

      <section className="card">
        <h2>{t("ps.versions")}</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{t("ps.col.version")}</th><th>{t("ps.col.status")}</th><th>{t("ps.col.from")}</th><th>{t("ps.col.goals")}</th></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="num">{p.version}</td>
                  <td>{t(`ps.status.${p.status}`)}</td>
                  <td>{p.effectiveFrom ? D.formatDate(p.effectiveFrom, lang) : "—"}</td>
                  <td className="num">{p.goals.length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
