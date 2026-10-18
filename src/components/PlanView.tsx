import type { PlanWithGoals } from "@/lib/services";

const PLACE = { SCHOOL: "в школе", HOME: "дома" } as const;

export function PlanView({ plan }: { plan: PlanWithGoals }) {
  return (
    <div className="stack">
      <ol className="stack" style={{ margin: 0, paddingLeft: 20 }}>
        {plan.goals.map((g) => (
          <li key={g.id}>
            <b>{g.adultText}</b> <span className="pill">{PLACE[g.place]}</span>
            <div className="muted small">Ребёнок видит: «{g.childText}»</div>
          </li>
        ))}
      </ol>
      <p className="small muted">
        Цель дня: {plan.thresholdPct}% отметок «Да». Таймер домашки: {plan.workMinutes} мин работы, {plan.breakMinutes} мин перерыв.
      </p>
      {plan.techniques.length > 0 && <p className="small muted">Приёмы для учителя: {plan.techniques.map((t) => t.title).join(", ")}.</p>}
    </div>
  );
}
