import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { ChildSwitch } from "@/components/ChildSwitch";
import { PlanView } from "@/components/PlanView";
import { approvePlanAction, consentAction } from "@/app/actions";
import { getDb } from "@/db";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function ParentPlan({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const { lang, t } = await getT();
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  const [consent, plans] = await Promise.all([S.consentOf(db, child.id), S.plansOf(db, child.id)]);
  const active = consent && !consent.revokedAt;
  const current = D.planForDate(plans, S.today());
  const upcoming = plans.find((p) => p.status === "ACTIVE" && p.effectiveFrom && p.effectiveFrom > S.today());
  const pending = plans.find((p) => p.status === "PENDING");

  return (
    <Shell current="/parent/plan">
      <ChildSwitch kids={kids} current={child.id} base="/parent/plan" />
      <h1>{t("ppl.title")}</h1>

      <section className={`card ${active ? "" : "warn"}`}>
        <h2>{t("ppl.consentTitle")}</h2>
        <p className="small">{t("ppl.consentBody", { days: S.PURGE_AFTER_DAYS })}</p>
        <ActionForm action={consentAction} className="row">
          <input type="hidden" name="studentId" value={child.id} />
          {active ? (
            <>
              <span className="pill good">{t("ppl.consentGiven", { date: D.formatStamp(consent!.givenAt, lang, true) })}</span>
              <button className="btn danger" name="intent" value="revoke" type="submit">{t("ppl.revoke")}</button>
            </>
          ) : (
            <button className="btn primary" name="intent" value="give" type="submit">{t("ppl.give")}</button>
          )}
        </ActionForm>
      </section>

      {pending && (
        <section className="card warn">
          <h2>{t("ppl.newFromPsych", { v: pending.version })}</h2>
          <PlanView plan={pending} />
          {active ? (
            <ActionForm action={approvePlanAction} className="row">
              <input type="hidden" name="studentId" value={child.id} />
              <input type="hidden" name="planId" value={pending.id} />
              <button className="btn primary" name="intent" value="approve" type="submit">{t("ppl.approve")}</button>
              <button className="btn quiet" name="intent" value="decline" type="submit">{t("ppl.decline")}</button>
              <span className="muted small">{current ? t("ppl.startsNext") : t("ppl.startsToday")}</span>
            </ActionForm>
          ) : (
            <p className="small">{t("ppl.needConsentFirst")}</p>
          )}
        </section>
      )}

      {upcoming && (
        <section className="card">
          <h2>{t("ppl.from", { date: D.formatDate(upcoming.effectiveFrom!, lang), v: upcoming.version })}</h2>
          <PlanView plan={upcoming} />
        </section>
      )}

      <section className="card">
        <h2>{current ? t("ppl.currentV", { v: current.version }) : t("ppl.current")}</h2>
        {current ? <PlanView plan={current} /> : <p className="muted">{t("ppl.none")}</p>}
      </section>
    </Shell>
  );
}
