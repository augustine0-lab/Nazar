import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { ChildSwitch } from "@/components/ChildSwitch";
import { HealthView } from "@/components/HealthView";
import { logHealthAction, setHealthEnabledAction } from "@/app/actions";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as M from "@/lib/more-services";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { MEDICATION } from "@/db/schema";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

/** Opt-in sleep and medication diary. Only the parent writes it; the psychologist reads it. */
export default async function ParentHealth({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const { lang, t } = await getT();
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  const consent = await hasActiveConsent(db, child.id);
  const health = consent ? await M.healthOf(db, user, child.id) : null;
  const today = S.today();
  const dates = Array.from({ length: 8 }, (_, i) => D.addDays(today, -i));
  const toggle = (enabled: boolean, label: MsgKey, cls: string) => (
    <ActionForm action={setHealthEnabledAction}>
      <input type="hidden" name="studentId" value={child.id} />
      <input type="hidden" name="enabled" value={enabled ? "on" : "off"} />
      <button className={`btn ${cls}`} type="submit">{t(label)}</button>
    </ActionForm>
  );

  return (
    <Shell current="/parent">
      <ChildSwitch kids={kids} current={child.id} base="/parent/health" />
      <h1>{t("hl.title")}: {child.displayName}</h1>
      <p className="muted">{t("hl.lead")}</p>
      {!consent ? (
        <section className="card warn"><p>{t("parent.needConsent.body")}</p></section>
      ) : !health ? (
        <section className="card">
          <p>{t("hl.who")}</p>
          <p className="muted small">{t("hl.medNote")}</p>
          {toggle(true, "hl.enable", "primary")}
        </section>
      ) : (
        <>
          <section className="card">
            <ActionForm action={logHealthAction} className="form-grid">
              <input type="hidden" name="studentId" value={child.id} />
              <label>
                {t("hl.date")}
                <select name="date" defaultValue={today}>
                  {dates.map((d) => <option key={d} value={d}>{D.shortWeekday(d, lang)}, {D.formatDate(d, lang)}</option>)}
                </select>
              </label>
              <label>{t("hl.sleep")}<input name="sleep" type="number" min={0} max={16} step={0.5} inputMode="decimal" placeholder="9" /></label>
              <label>
                {t("hl.med")}
                <select name="medication" defaultValue="">
                  <option value="">{t("hl.med.unset")}</option>
                  {MEDICATION.map((m) => <option key={m} value={m}>{t(`hl.med.${m}`)}</option>)}
                </select>
              </label>
              <button className="btn primary" type="submit">{t("hl.save")}</button>
            </ActionForm>
            <p className="muted small">{t("hl.who")}</p>
          </section>
          <section className="card">
            <HealthView logs={health.logs} analysis={health.analysis} />
          </section>
          <section className="card">
            <p className="muted small">{t("hl.disableHint")}</p>
            {toggle(false, "hl.disable", "quiet danger")}
          </section>
        </>
      )}
    </Shell>
  );
}
