import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { ChildSwitch } from "@/components/ChildSwitch";
import { grantRewardAction, pinGoalAction, saveRewardAction } from "@/app/actions";
import * as M from "@/lib/more-services";
import { getDb } from "@/db";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import { formatStamp } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function ParentRewards({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const { lang, t, L } = await getT();
  const fmt = (d: Date | null) => (d ? formatStamp(d, lang) : "");
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  const [list, st, history, goal] = await Promise.all([S.rewardsOf(db, child.id, true), S.stars(db, child.id), S.rewardRequestsOf(db, child.id), M.savingGoal(db, child.id)]);

  return (
    <Shell current="/parent/rewards">
      <ChildSwitch kids={kids} current={child.id} base="/parent/rewards" />
      <div className="row between">
        <h1>{t("nav.rewards")}</h1>
        <span>{t("rewards.stars")} <b className="num" style={{ color: "var(--star)" }}>★ {st.balance}</b></span>
      </div>
      <p className="muted">{t("rewards.tip")}</p>

      <section className="card">
        <h2>🐷 {t("goal.pinTitle")}</h2>
        <p className="muted small">{t("goal.pinHint")}</p>
        {goal && <p>{t("goal.current", { title: L(goal.reward.title), pct: goal.pct })}</p>}
        <ActionForm action={pinGoalAction} className="row">
          <input type="hidden" name="studentId" value={child.id} />
          <select name="rewardId" defaultValue={goal?.reward.id ?? ""} aria-label={t("goal.pinTitle")}>
            <option value="">{t("goal.none")}</option>
            {list.filter((r) => r.active).map((r) => <option key={r.id} value={r.id}>{L(r.title)} · ★ {r.cost}</option>)}
          </select>
          <button className="btn" type="submit">{t("goal.save")}</button>
        </ActionForm>
      </section>

      <section className="card">
        <h2>{t("rewards.list")}</h2>
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="stack">
              <ActionForm action={saveRewardAction} className="form-grid">
                <input type="hidden" name="studentId" value={child.id} />
                <input type="hidden" name="rewardId" value={r.id} />
                <label>{t("rewards.name")}<input name="title" defaultValue={L(r.title)} required /></label>
                <label>{t("rewards.cost")}<input name="cost" type="number" min={1} max={50} defaultValue={r.cost} required /></label>
                <label>{t("rewards.visible")}
                  <select name="active" defaultValue={r.active ? "on" : "off"}><option value="on">{t("rewards.visibleYes")}</option><option value="off">{t("rewards.hidden")}</option></select>
                </label>
                <button className="btn" type="submit">{t("rewards.save")}</button>
              </ActionForm>
              <ActionForm action={grantRewardAction} className="row">
                <input type="hidden" name="studentId" value={child.id} />
                <input type="hidden" name="rewardId" value={r.id} />
                <button className="btn quiet" type="submit" disabled={st.balance < r.cost}>
                  {st.balance < r.cost ? t("rewards.short", { n: r.cost - st.balance }) : t("rewards.grantNow")}
                </button>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t("rewards.newTitle")}</h2>
        <ActionForm action={saveRewardAction} className="form-grid">
          <input type="hidden" name="studentId" value={child.id} />
          <label>{t("rewards.name")}<input name="title" placeholder={t("rewards.newPlaceholder")} required /></label>
          <label>{t("rewards.cost")}<input name="cost" type="number" min={1} max={50} defaultValue={5} required /></label>
          <button className="btn primary" type="submit">{t("rewards.add")}</button>
        </ActionForm>
      </section>

      <section className="card">
        <h2>{t("rewards.history")}</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>{t("rewards.name")}</th><th>{t("rewards.col.status")}</th><th>{t("rewards.col.when")}</th></tr></thead>
            <tbody>
              {history.slice(0, 15).map(({ request, reward }) => (
                <tr key={request.id}>
                  <td>{L(reward.title)}</td>
                  <td>{t(`rewards.status.${request.status}`)}{request.costAtGrant ? ` · ★ ${request.costAtGrant}` : ""}</td>
                  <td className="num">{fmt(request.decidedAt ?? request.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </Shell>
  );
}
