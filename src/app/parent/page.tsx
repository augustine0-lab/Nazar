import Link from "next/link";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { ChildSwitch } from "@/components/ChildSwitch";
import { HomeGoals } from "@/components/HomeGoals";
import { WeekStrip } from "@/components/WeekStrip";
import { declineRewardAction, grantRewardAction } from "@/app/actions";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";

export default async function ParentToday({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  const day = S.workDay();
  const consent = await hasActiveConsent(db, child.id);
  const q = `?child=${child.id}`;

  if (!consent) {
    return (
      <Shell current="/parent">
        <ChildSwitch kids={kids} current={child.id} base="/parent" />
        <h1>{child.displayName}</h1>
        <section className="card warn">
          <h2>Нужно ваше согласие</h2>
          <p>Пока вы не дали согласие на обработку данных, учитель не может ставить отметки и план поддержки не работает.</p>
          <Link className="btn primary" href={`/parent/plan${q}`}>Посмотреть план и дать согласие</Link>
        </section>
      </Shell>
    );
  }

  const [sum, week, st, requests, plans] = await Promise.all([
    S.daySummary(db, child.id, day),
    S.weekSummary(db, child.id, D.mondayOf(day)),
    S.stars(db, child.id, day),
    S.rewardRequestsOf(db, child.id),
    S.plansOf(db, child.id),
  ]);
  const pendingPlan = plans.find((p) => p.status === "PENDING");
  const pendingReq = requests.filter((r) => r.request.status === "PENDING");
  const schoolGoals = sum.plan?.goals.filter((g) => g.place === "SCHOOL") ?? [];
  const homeGoals = sum.plan?.goals.filter((g) => g.place === "HOME") ?? [];
  const teacherNote = sum.notes.find((n) => n.authorRole === "TEACHER" && n.note.text);
  const schoolTally = D.tally(sum.marks.filter((m) => m.lessonNo > 0));

  return (
    <Shell current="/parent">
      <ChildSwitch kids={kids} current={child.id} base="/parent" />
      <div className="row between">
        <h1>{child.displayName}</h1>
        <span className="muted">{D.shortWeekday(day)}, {D.formatRuDate(day)}</span>
      </div>

      {pendingPlan && (
        <section className="card warn">
          <h2>Психолог предлагает новый план</h2>
          <p>Посмотрите цели и согласуйте их, чтобы план начал действовать.</p>
          <Link className="btn primary" href={`/parent/plan${q}`}>Посмотреть план</Link>
        </section>
      )}

      <div className="grid2">
        <section className="card">
          <span className="eyebrow">Итог дня в школе</span>
          <div className="row">
            <span className="big num">{schoolTally.ratio === null ? "—" : `${D.pct(schoolTally.ratio)}%`}</span>
            <span className="muted">целей выполнено{sum.plan ? `, цель дня ${sum.plan.thresholdPct}%` : ""}</span>
          </div>
          <div className="stack">
            {schoolGoals.map((g) => {
              const t = sum.byGoal[g.id];
              return (
                <div key={g.id} className="stack" style={{ gap: 4 }}>
                  <div className="row between small"><span>{g.adultText}</span><span className="muted num">{t.yes} из {t.yes + t.no}</span></div>
                  <div className="bar"><i style={{ width: `${(t.ratio ?? 0) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
          <p className="msg" style={{ background: "var(--surface-2)" }}>
            {teacherNote ? <><b>{teacherNote.author}:</b> {teacherNote.note.text}</> : sum.closed ? "Учитель закрыл день без заметки." : "День ещё идёт. Отметки появляются после каждого урока."}
          </p>
        </section>

        <section className="card">
          <span className="eyebrow">Неделя</span>
          <WeekStrip days={week} today={day} />
          <p className="muted small">Хвалите за прогресс, а не за идеальный результат. Неудачный день не отменяет заработанные звёзды.</p>
          {homeGoals.length > 0 && (
            <>
              <h3>Дома сегодня</h3>
              <HomeGoals
                studentId={child.id}
                date={day}
                goals={homeGoals.map((g) => ({ id: g.id, text: g.adultText, value: sum.marks.find((m) => m.goalId === g.id && m.lessonNo === 0)?.value ?? null }))}
              />
            </>
          )}
        </section>
      </div>

      <section className="card">
        <div className="row between">
          <h2>Звёзды и награды</h2>
          <span>Сейчас у {child.displayName.split(" ")[0]}: <b className="num" style={{ color: "var(--star)" }}>★ {st.balance}</b></span>
        </div>
        {pendingReq.length ? (
          <div className="list">
            {pendingReq.map(({ request, reward }) => (
              <div key={request.id} className="row between">
                <span>Просит: <b>{reward.title}</b> <span className="pill star">★ {reward.cost}</span></span>
                <span className="row">
                  <ActionForm action={grantRewardAction} className="row">
                    <input type="hidden" name="studentId" value={child.id} />
                    <input type="hidden" name="rewardId" value={reward.id} />
                    <input type="hidden" name="requestId" value={request.id} />
                    <button className="btn primary" type="submit" disabled={st.balance < reward.cost}>Выдать</button>
                  </ActionForm>
                  <ActionForm action={declineRewardAction} className="row">
                    <input type="hidden" name="studentId" value={child.id} />
                    <input type="hidden" name="requestId" value={request.id} />
                    <button className="btn quiet" type="submit">Не сегодня</button>
                  </ActionForm>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Запросов на награды нет.</p>
        )}
        <Link href={`/parent/rewards${q}`}>Настроить награды →</Link>
      </section>
    </Shell>
  );
}
