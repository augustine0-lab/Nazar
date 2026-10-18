import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { requestRewardAction } from "@/app/actions";
import { getDb } from "@/db";
import { myStudent } from "@/lib/me";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import { getT } from "@/lib/i18n/server";

export default async function StudentRewards() {
  const user = await requireUser("STUDENT");
  const { t, L } = await getT();
  const db = getDb();
  const me = await myStudent(db, user);
  const [st, list, reqs] = await Promise.all([S.stars(db, me.id), S.rewardsOf(db, me.id), S.rewardRequestsOf(db, me.id)]);
  const pendingIds = new Set(reqs.filter((r) => r.request.status === "PENDING").map((r) => r.reward.id));
  return (
    <Shell current="/student/rewards">
      <div className="child stack">
        <div className="row between">
          <h1>{t("nav.rewards")}</h1>
          <span>{t("st.has")} <b className="num" style={{ color: "var(--star)" }}>★ {st.balance}</b></span>
        </div>
        <section className="card">
          <div className="list">
            {list.map((r) => (
              <div key={r.id} className="row between">
                <span><b>{L(r.title)}</b> <span className="pill star">★ {r.cost}</span></span>
                {pendingIds.has(r.id) ? (
                  <span className="pill good">{t("st.waiting")}</span>
                ) : (
                  <ActionForm action={requestRewardAction} className="row">
                    <input type="hidden" name="studentId" value={me.id} />
                    <input type="hidden" name="rewardId" value={r.id} />
                    <button className="btn primary" type="submit" disabled={st.balance < r.cost}>
                      {st.balance < r.cost ? t("st.need", { n: r.cost - st.balance }) : t("st.want")}
                    </button>
                  </ActionForm>
                )}
              </div>
            ))}
            {!list.length && <p className="muted">{t("st.noRewards")}</p>}
          </div>
        </section>
      </div>
    </Shell>
  );
}
