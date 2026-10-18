import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { GoalChart } from "@/components/GoalChart";
import { PlanEditor } from "./PlanEditor";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";

const STATUS = { DRAFT: "возвращён на доработку", PENDING: "ждёт родителя", ACTIVE: "действует", ARCHIVED: "в архиве" } as const;

export default async function PsychStudent({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("PSYCHOLOGIST");
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "VIEW", id))) notFound();
  const { student, cls } = await S.getStudent(db, id);
  const canEdit = await can(db, user, "EDIT_PLAN", id);
  const [series, plans, techniques, checks] = await Promise.all([
    S.goalSeries(db, id, 6),
    S.plansOf(db, id),
    S.allTechniques(db),
    S.selfChecksOf(db, id, D.addDays(S.today(), -14)),
  ]);
  const current = D.planForDate(plans, S.today());
  const base = plans.find((p) => p.status === "PENDING") ?? plans.find((p) => p.status === "ACTIVE") ?? current ?? null;
  const hints = series.goals
    .map((g, i) => ({ g, s: D.goalSuggestion(series.weeks.slice(0, -1).map((w) => w.ratios[i])) }))
    .filter((x) => x.s);

  return (
    <Shell current="/psych">
      <div className="stack" style={{ gap: 2 }}>
        <Link href="/psych" className="small">← Мои дети</Link>
        <h1>{student.displayName}</h1>
        <span className="muted">{cls.name}{student.birthYear ? `, ${student.birthYear} г. р.` : ""}</span>
      </div>

      <section className="card">
        <div className="row between"><h2>Динамика по неделям</h2><span className="eyebrow">доля уроков с выполненной целью</span></div>
        {series.goals.length ? <GoalChart goals={series.goals} weeks={series.weeks} threshold={current?.thresholdPct ?? base?.thresholdPct ?? 70} /> : <p className="muted">Данных пока нет.</p>}
        {hints.map(({ g, s }) => (
          <p key={g.id} className="msg" style={{ background: "var(--star-soft)" }}>
            {s === "RAISE"
              ? `«${g.adultText}» выше ${D.RAISE_BAR * 100}% две недели подряд. Можно усложнить цель или заменить её новой.`
              : `«${g.adultText}» ниже ${D.SIMPLIFY_BAR * 100}% две недели подряд. Стоит упростить цель или разбить её на шаги.`}
          </p>
        ))}
      </section>

      <section className="card">
        <h2>Самопроверки за 2 недели</h2>
        <p className="num">
          Всего {checks.length}, «занимаюсь заданием» {checks.filter((c) => c.onTask).length}
          {checks.length ? ` (${Math.round((checks.filter((c) => c.onTask).length / checks.length) * 100)}%)` : ""}.
        </p>
      </section>

      {canEdit ? (
        <section className="card">
          <h2>Редактор плана</h2>
          <p className="muted small">Новая версия уходит родителю на согласование. Уже поставленные отметки не меняются.</p>
          <PlanEditor
            studentId={id}
            techniques={techniques.map((t) => ({ id: t.id, title: t.title, evidence: t.evidence }))}
            initial={{
              thresholdPct: base?.thresholdPct ?? 70,
              workMinutes: base?.workMinutes ?? 10,
              breakMinutes: base?.breakMinutes ?? 3,
              goals: base?.goals.map((g) => ({ adultText: g.adultText, childText: g.childText, place: g.place, lineageId: g.lineageId })) ?? [{ adultText: "", childText: "", place: "SCHOOL", lineageId: null }],
              techniqueIds: base?.techniques.map((t) => t.id) ?? [],
            }}
          />
        </section>
      ) : (
        <section className="card warn"><p>Редактировать план можно после согласия родителя на обработку данных.</p></section>
      )}

      <section className="card">
        <h2>Версии плана</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Версия</th><th>Статус</th><th>Действует с</th><th>Целей</th></tr></thead>
            <tbody>
              {plans.map((p) => (
                <tr key={p.id}>
                  <td className="num">{p.version}</td>
                  <td>{STATUS[p.status]}</td>
                  <td>{p.effectiveFrom ? D.formatRuDate(p.effectiveFrom) : "—"}</td>
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
