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

const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: process.env.APP_TZ ?? "Europe/Moscow" });

export default async function ParentPlan({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
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
      <h1>План поддержки и согласие</h1>

      <section className={`card ${active ? "" : "warn"}`}>
        <h2>Согласие на обработку данных</h2>
        <p className="small">
          Платформа хранит имя ребёнка, класс, год рождения и наблюдения: отметки по целям, заметки, домашние задания и самопроверки.
          Диагнозы, фото и контакты ребёнка не хранятся. Данные видят только учитель класса, вы и школьный психолог.
          Вы можете отозвать согласие в любой момент: сбор данных сразу остановится, а наблюдения удалятся через {S.PURGE_AFTER_DAYS} дней.
        </p>
        <ActionForm action={consentAction} className="row">
          <input type="hidden" name="studentId" value={child.id} />
          {active ? (
            <>
              <span className="pill good">согласие дано {fmt(consent!.givenAt)}</span>
              <button className="btn danger" name="intent" value="revoke" type="submit">Отозвать согласие</button>
            </>
          ) : (
            <button className="btn primary" name="intent" value="give" type="submit">Даю согласие</button>
          )}
        </ActionForm>
      </section>

      {pending && (
        <section className="card warn">
          <h2>Новый план от психолога · версия {pending.version}</h2>
          <PlanView plan={pending} />
          {active ? (
            <ActionForm action={approvePlanAction} className="row">
              <input type="hidden" name="studentId" value={child.id} />
              <input type="hidden" name="planId" value={pending.id} />
              <button className="btn primary" name="intent" value="approve" type="submit">Согласовать</button>
              <button className="btn quiet" name="intent" value="decline" type="submit">Вернуть на доработку</button>
              <span className="muted small">{current ? "Новый план начнёт действовать со следующего учебного дня." : "План начнёт действовать сегодня."}</span>
            </ActionForm>
          ) : (
            <p className="small">Чтобы согласовать план, сначала дайте согласие на обработку данных.</p>
          )}
        </section>
      )}

      {upcoming && (
        <section className="card">
          <h2>Со {D.formatRuDate(upcoming.effectiveFrom!)} · версия {upcoming.version}</h2>
          <PlanView plan={upcoming} />
        </section>
      )}

      <section className="card">
        <h2>Действует сейчас{current ? ` · версия ${current.version}` : ""}</h2>
        {current ? <PlanView plan={current} /> : <p className="muted">Согласованного плана пока нет.</p>}
      </section>
    </Shell>
  );
}
