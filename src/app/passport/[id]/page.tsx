import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { PrintButton } from "@/components/PrintButton";
import { savePassportAction } from "@/app/actions";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { HOME_BY_ROLE, requireUser } from "@/lib/session";
import * as C from "@/lib/concept-services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

const ICON: Record<D.PassportField, string> = { strengths: "💪", interests: "⭐", helps: "✅", hard: "⚠️", calming: "🌿", family: "📞" };

/**
 * A one-page passport for the next teacher: what the child is good at, what helps, what makes things hard,
 * and what the team has already checked. Filled in by the adults, the rest comes from the platform's data.
 */
export default async function Passport({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("TEACHER", "PARENT", "PSYCHOLOGIST");
  const { lang, t, L } = await getT();
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "VIEW_PASSPORT", id))) notFound();
  const canEdit = await can(db, user, "EDIT_PASSPORT", id);
  const p = await C.passportOf(db, user, id);
  const back = user.role === "PARENT" ? `/parent?child=${id}` : `${HOME_BY_ROLE[user.role]}/student/${id}`;
  const keep = p.tried.filter((x) => x.trial.decision === "KEEP");
  const drop = p.tried.filter((x) => x.trial.decision === "DROP");

  return (
    <Shell current={HOME_BY_ROLE[user.role]}>
      <div className="no-print stack">
        <Link href={back} className="small">{t("rp.back")}</Link>
        <PrintButton />
      </div>
      <article className="report stack">
        <header className="stack" style={{ gap: 4 }}>
          <span className="eyebrow">{t("pp.eyebrow")}</span>
          <h1>{t("pp.title")}: {p.student.displayName}</h1>
          <span className="muted">
            {t("rp.school", { school: L(p.school.name), cls: p.cls.name })}
            {p.student.birthYear ? t("ps.birth", { year: p.student.birthYear }) : ""}
          </span>
          <span className="muted small">
            {p.updatedBy && p.passport
              ? t("pp.updated", { name: L(p.updatedBy.name), role: t(`role.${p.updatedBy.role}`), date: D.formatDate(D.isoDate(p.passport.updatedAt), lang) })
              : t("pp.never")}
          </span>
        </header>
        <p>{t("pp.lead")}</p>

        <div className="grid2">
          {D.PASSPORT_FIELDS.map((f) => (
            <section key={f} className="card">
              <h2><span aria-hidden="true">{ICON[f]}</span> {t(`pp.f.${f}` as MsgKey)}</h2>
              {p.passport?.[f] ? <p style={{ whiteSpace: "pre-line" }}>{L(p.passport[f])}</p> : <p className="muted">{t("pp.empty")}</p>}
            </section>
          ))}
        </div>

        <section className="card">
          <h2>{t("pp.fromData")}</h2>
          <div className="stack">
            <div>
              <b>{t("pp.goals")}</b>
              {p.plan?.goals.length ? (
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>{p.plan.goals.map((g) => <li key={g.id}>{L(g.adultText)} <span className="muted small">({t(`pp.place.${g.place}`)})</span></li>)}</ul>
              ) : (
                <p className="muted">{t("pp.noPlan")}</p>
              )}
            </div>
            {p.plan && p.plan.techniques.length > 0 && (
              <div>
                <b>{t("pp.techniques")}</b>
                <p>{p.plan.techniques.map((tq) => L(tq.title)).join(" · ")}</p>
              </div>
            )}
            <div>
              <b>{t("pp.checked")}</b>
              {p.tried.length ? (
                <ul style={{ margin: "4px 0 0", paddingLeft: 20 }}>
                  {keep.map((x) => <li key={x.trial.id}>✅ {L(x.technique.title)}{x.trial.conclusion ? `: ${L(x.trial.conclusion)}` : ""}</li>)}
                  {drop.map((x) => <li key={x.trial.id}>✖️ {L(x.technique.title)}{x.trial.conclusion ? `: ${L(x.trial.conclusion)}` : ""}</li>)}
                </ul>
              ) : (
                <p className="muted">{t("pp.noTrials")}</p>
              )}
              {p.running && <p className="small">{t("pp.running", { technique: L(p.running.technique.title), date: D.formatDate(p.running.trial.endDate, lang) })}</p>}
            </div>
            <p className="num">{p.month.rated ? t("pp.month", { n: p.month.success, total: p.month.rated }) : t("pp.monthNone")}</p>
          </div>
        </section>

        <section className="card">
          <h2>{t("pp.team")}</h2>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            <li>{t("role.TEACHER")}: {p.teacher ? L(p.teacher) : "—"}</li>
            {p.parents.map((x, i) => <li key={i}>{L(x.relation)}: {L(x.name)}</li>)}
            {p.psychs.map((n, i) => <li key={i}>{t("role.PSYCHOLOGIST")}: {L(n)}</li>)}
          </ul>
          <p className="muted small">{t("pp.privacy")}</p>
        </section>
      </article>

      {canEdit && (
        <section className="card no-print">
          <details open={!p.passport}>
            <summary><h2 style={{ display: "inline" }}>{t("pp.edit")}</h2></summary>
            <ActionForm action={savePassportAction} className="stack">
              <input type="hidden" name="studentId" value={id} />
              <p className="muted small">{t("pp.editHint")}</p>
              {D.PASSPORT_FIELDS.map((f) => (
                <label key={f}>
                  {ICON[f]} {t(`pp.f.${f}` as MsgKey)}
                  <span className="muted small">{t(`pp.q.${f}` as MsgKey)}</span>
                  <textarea name={f} rows={3} maxLength={D.PASSPORT_MAX} defaultValue={p.passport ? L(p.passport[f]) : ""} />
                </label>
              ))}
              <button className="btn primary" type="submit">{t("pp.save")}</button>
            </ActionForm>
          </details>
        </section>
      )}
    </Shell>
  );
}
