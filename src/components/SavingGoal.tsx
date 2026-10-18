import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

/** The child's piggy bank: one big reward and how far the stars have got. */
export async function SavingGoal({ goal }: { goal: { reward: { title: string; cost: number }; pct: number; left: number; milestone: number } }) {
  const { t, L } = await getT();
  const reached = goal.left === 0;
  return (
    <section className="card saving">
      <div className="row between">
        <h2>🐷 {t("goal.title", { title: L(goal.reward.title) })}</h2>
        <span className="pill star num">{goal.pct}%</span>
      </div>
      <div className="bar big-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goal.pct} aria-label={L(goal.reward.title)}>
        <i style={{ width: `${goal.pct}%` }} />
        {[25, 50, 75].map((m) => <span key={m} className="tick" style={{ left: `${m}%` }} aria-hidden="true" />)}
      </div>
      <p>
        {reached ? (
          <>{t("goal.reached")} <Link href="/student/rewards">{t("st.ask")}</Link></>
        ) : (
          <>{t(`goal.ms${Math.min(3, goal.milestone)}` as MsgKey)} {t("goal.left", { n: goal.left })}</>
        )}
      </p>
    </section>
  );
}
