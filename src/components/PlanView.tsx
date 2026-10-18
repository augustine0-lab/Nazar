import type { PlanWithGoals } from "@/lib/services";
import { getT } from "@/lib/i18n/server";

export async function PlanView({ plan }: { plan: PlanWithGoals }) {
  const { t, L } = await getT();
  return (
    <div className="stack">
      <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
        {plan.goals.map((g) => (
          <li key={g.id}>
            <b>{L(g.adultText)}</b> <span className="pill">{t(`plan.place.${g.place}`)}</span>
            <div className="muted small">{t("plan.childSees", { text: L(g.childText) })}</div>
          </li>
        ))}
      </ol>
      <p className="small muted">
        {t("plan.summary", { pct: plan.thresholdPct, work: plan.workMinutes, brk: plan.breakMinutes })}
      </p>
      {plan.techniques.length > 0 && <p className="small muted">{t("plan.techniquesLine", { list: plan.techniques.map((x) => L(x.title)).join(", ") })}</p>}
    </div>
  );
}
