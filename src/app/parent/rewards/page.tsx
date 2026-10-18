import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { ChildSwitch } from "@/components/ChildSwitch";
import { grantRewardAction, saveRewardAction } from "@/app/actions";
import { getDb } from "@/db";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";

const fmt = (d: Date | null) => (d ? d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", timeZone: process.env.APP_TZ ?? "Europe/Moscow" }) : "");
const STATUS = { PENDING: "ждёт ответа", GRANTED: "выдана", DECLINED: "не сегодня" } as const;

export default async function ParentRewards({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  const [list, st, history] = await Promise.all([S.rewardsOf(db, child.id, true), S.stars(db, child.id), S.rewardRequestsOf(db, child.id)]);

  return (
    <Shell current="/parent/rewards">
      <ChildSwitch kids={kids} current={child.id} base="/parent/rewards" />
      <div className="row between">
        <h1>Награды</h1>
        <span>Звёзд: <b className="num" style={{ color: "var(--star)" }}>★ {st.balance}</b></span>
      </div>
      <p className="muted">Лучше всего работают маленькие и быстрые награды: в тот же вечер, а не в конце месяца. Звёзды за «Нет» не списываются.</p>

      <section className="card">
        <h2>Список наград</h2>
        <div className="list">
          {list.map((r) => (
            <div key={r.id} className="stack">
              <ActionForm action={saveRewardAction} className="form-grid">
                <input type="hidden" name="studentId" value={child.id} />
                <input type="hidden" name="rewardId" value={r.id} />
                <label>Награда<input name="title" defaultValue={r.title} required /></label>
                <label>Цена в звёздах<input name="cost" type="number" min={1} max={50} defaultValue={r.cost} required /></label>
                <label>Видна ребёнку
                  <select name="active" defaultValue={r.active ? "on" : "off"}><option value="on">да</option><option value="off">скрыта</option></select>
                </label>
                <button className="btn" type="submit">Сохранить</button>
              </ActionForm>
              <ActionForm action={grantRewardAction} className="row">
                <input type="hidden" name="studentId" value={child.id} />
                <input type="hidden" name="rewardId" value={r.id} />
                <button className="btn quiet" type="submit" disabled={st.balance < r.cost}>
                  {st.balance < r.cost ? `Не хватает ${r.cost - st.balance} ★` : "Выдать сейчас"}
                </button>
              </ActionForm>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Новая награда</h2>
        <ActionForm action={saveRewardAction} className="form-grid">
          <input type="hidden" name="studentId" value={child.id} />
          <label>Награда<input name="title" placeholder="Например: выбрать ужин" required /></label>
          <label>Цена в звёздах<input name="cost" type="number" min={1} max={50} defaultValue={5} required /></label>
          <button className="btn primary" type="submit">Добавить</button>
        </ActionForm>
      </section>

      <section className="card">
        <h2>История</h2>
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Награда</th><th>Статус</th><th>Когда</th></tr></thead>
            <tbody>
              {history.slice(0, 15).map(({ request, reward }) => (
                <tr key={request.id}>
                  <td>{reward.title}</td>
                  <td>{STATUS[request.status]}{request.costAtGrant ? ` · ★ ${request.costAtGrant}` : ""}</td>
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
