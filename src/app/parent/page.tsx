import Link from "next/link";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { ChildSwitch } from "@/components/ChildSwitch";
import { HomeGoals } from "@/components/HomeGoals";
import { WeekStrip } from "@/components/WeekStrip";
import { MoodStrip } from "@/components/MoodStrip";
import * as F from "@/lib/feature-services";
import { declineRewardAction, grantRewardAction } from "@/app/actions";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function ParentToday({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const { lang, t, L } = await getT();
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
          <h2>{t("parent.needConsent.title")}</h2>
          <p>{t("parent.needConsent.body")}</p>
          <Link className="btn primary" href={`/parent/plan${q}`}>{t("parent.needConsent.cta")}</Link>
        </section>
      </Shell>
    );
  }

  const [moods, sum, week, st, requests, plans] = await Promise.all([
    F.moodsOf(db, child.id, D.addDays(S.today(), -6)),
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
        <span className="muted">{D.shortWeekday(day, lang)}, {D.formatDate(day, lang)}</span>
      </div>

      {pendingPlan && (
        <section className="card warn">
          <h2>{t("parent.newPlan.title")}</h2>
          <p>{t("parent.newPlan.body")}</p>
          <Link className="btn primary" href={`/parent/plan${q}`}>{t("parent.newPlan.cta")}</Link>
        </section>
      )}

      <div className="grid2">
        <section className="card">
          <span className="eyebrow">{t("parent.dayTitle")}</span>
          <div className="row">
            <span className="big num">{schoolTally.ratio === null ? "—" : `${D.pct(schoolTally.ratio)}%`}</span>
            <span className="muted">{sum.plan ? t("parent.goalsDoneTh", { pct: sum.plan.thresholdPct }) : t("parent.goalsDone")}</span>
          </div>
          <div className="stack">
            {schoolGoals.map((g) => {
              const tl = sum.byGoal[g.id];
              return (
                <div key={g.id} className="stack" style={{ gap: 4 }}>
                  <div className="row between small"><span>{L(g.adultText)}</span><span className="muted num">{t("parent.ofCount", { yes: tl.yes, n: tl.yes + tl.no })}</span></div>
                  <div className="bar"><i style={{ width: `${(tl.ratio ?? 0) * 100}%` }} /></div>
                </div>
              );
            })}
          </div>
          <p className="msg" style={{ background: "var(--surface-2)" }}>
            {teacherNote ? <><b>{L(teacherNote.author)}:</b> {L(teacherNote.note.text)}</> : sum.closed ? t("parent.noteEmpty") : t("parent.dayRunning")}
          </p>
        </section>

        <section className="card">
          <span className="eyebrow">{t("parent.week")}</span>
          <WeekStrip days={week} today={day} />
          <p className="muted small">{t("parent.praise")}</p>
          {homeGoals.length > 0 && (
            <>
              <h3>{t("parent.homeToday")}</h3>
              <HomeGoals
                studentId={child.id}
                date={day}
                goals={homeGoals.map((g) => ({ id: g.id, text: L(g.adultText), value: sum.marks.find((m) => m.goalId === g.id && m.lessonNo === 0)?.value ?? null }))}
              />
            </>
          )}
        </section>
      </div>

      <section className="card"><MoodStrip moods={moods} today={S.today()} /></section>

      <section className="card">
        <div className="row">
          <Link className="btn" href={`/chat/${child.id}`}>{t("chat.open")}</Link>
          <Link className="btn" href={`/scale/${child.id}`}>{t("sc.link")}</Link>
          <Link className="btn" href={`/report/${child.id}`}>{t("rp.link")}</Link>
        </div>
        <p className="muted small">{t("sc.linkHint")}</p>
      </section>

      <section className="card">
        <div className="row between">
          <h2>{t("parent.starsRewards")}</h2>
          <span>{t("parent.nowHas", { name: child.displayName.split(" ")[0] })} <b className="num" style={{ color: "var(--star)" }}>★ {st.balance}</b></span>
        </div>
        {pendingReq.length ? (
          <div className="list">
            {pendingReq.map(({ request, reward }) => (
              <div key={request.id} className="row between">
                <span>{t("parent.asks")} <b>{L(reward.title)}</b> <span className="pill star">★ {reward.cost}</span></span>
                <span className="row">
                  <ActionForm action={grantRewardAction} className="row">
                    <input type="hidden" name="studentId" value={child.id} />
                    <input type="hidden" name="rewardId" value={reward.id} />
                    <input type="hidden" name="requestId" value={request.id} />
                    <button className="btn primary" type="submit" disabled={st.balance < reward.cost}>{t("parent.grant")}</button>
                  </ActionForm>
                  <ActionForm action={declineRewardAction} className="row">
                    <input type="hidden" name="studentId" value={child.id} />
                    <input type="hidden" name="requestId" value={request.id} />
                    <button className="btn quiet" type="submit">{t("parent.notToday")}</button>
                  </ActionForm>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{t("parent.noRequests")}</p>
        )}
        <Link href={`/parent/rewards${q}`}>{t("parent.setupRewards")}</Link>
      </section>
    </Shell>
  );
}
