"use client";

import { useState, useTransition } from "react";
import { submitPlanAction } from "@/app/actions";
import { MAX_GOALS, validatePlan } from "@/lib/domain";

type Goal = { adultText: string; childText: string; place: "SCHOOL" | "HOME"; lineageId: string | null };
type Init = { thresholdPct: number; workMinutes: number; breakMinutes: number; goals: Goal[]; techniqueIds: string[] };

const TEMPLATES: Omit<Goal, "lineageId">[] = [
  { adultText: "Начинает задание в течение 2 минут", childText: "Начинаю задание сразу", place: "SCHOOL" },
  { adultText: "Поднимает руку, а не выкрикивает", childText: "Поднимаю руку", place: "SCHOOL" },
  { adultText: "Записывает домашнее задание", childText: "Записываю домашку", place: "SCHOOL" },
  { adultText: "Остаётся на месте до конца задания", childText: "Сижу до конца задания", place: "SCHOOL" },
  { adultText: "Выполняет инструкцию с первого раза", childText: "Делаю с первого раза", place: "SCHOOL" },
  { adultText: "Собирает портфель с вечера", childText: "Собираю портфель вечером", place: "HOME" },
];
const EV = { STRONG: "сильные данные", MODERATE: "средние", PRACTICE: "практика" } as const;

export function PlanEditor({ studentId, initial, techniques }: { studentId: string; initial: Init; techniques: { id: string; title: string; evidence: keyof typeof EV }[] }) {
  const [plan, setPlan] = useState(initial);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const errors = validatePlan(plan);

  const setGoal = (i: number, patch: Partial<Goal>) => setPlan({ ...plan, goals: plan.goals.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  function submit() {
    setMsg(null);
    start(async () => setMsg(await submitPlanAction({ studentId, ...plan })));
  }

  return (
    <div className="stack">
      {plan.goals.map((g, i) => (
        <fieldset key={i} className="card" style={{ padding: 12, gap: 8 }}>
          <legend className="eyebrow">Цель {i + 1}</legend>
          <div className="form-grid">
            <label>Для взрослых<input id={`goal-${i}-adult`} value={g.adultText} onChange={(e) => setGoal(i, { adultText: e.target.value })} /></label>
            <label>Для ребёнка<input id={`goal-${i}-child`} value={g.childText} onChange={(e) => setGoal(i, { childText: e.target.value })} /></label>
            <label>Где
              <select id={`goal-${i}-place`} value={g.place} onChange={(e) => setGoal(i, { place: e.target.value as Goal["place"] })}>
                <option value="SCHOOL">в школе, учитель</option>
                <option value="HOME">дома, родитель</option>
              </select>
            </label>
            <button type="button" className="btn quiet danger" onClick={() => setPlan({ ...plan, goals: plan.goals.filter((_, j) => j !== i) })}>Убрать</button>
          </div>
        </fieldset>
      ))}
      {plan.goals.length < MAX_GOALS && (
        <div className="row">
          <button type="button" className="btn" onClick={() => setPlan({ ...plan, goals: [...plan.goals, { adultText: "", childText: "", place: "SCHOOL", lineageId: null }] })}>Добавить цель</button>
          <select aria-label="Добавить из шаблона" value="" onChange={(e) => {
            const t = TEMPLATES[Number(e.target.value)];
            if (t) setPlan({ ...plan, goals: [...plan.goals, { ...t, lineageId: null }] });
          }}>
            <option value="">Из шаблона…</option>
            {TEMPLATES.map((t, i) => <option key={i} value={i}>{t.adultText}</option>)}
          </select>
        </div>
      )}

      <div className="form-grid">
        <label>Порог успеха дня: {plan.thresholdPct}%
          <input id="threshold" type="range" min={50} max={90} step={5} value={plan.thresholdPct} onChange={(e) => setPlan({ ...plan, thresholdPct: Number(e.target.value) })} />
        </label>
        <label>Работа, минут<input id="work" type="number" min={3} max={30} value={plan.workMinutes} onChange={(e) => setPlan({ ...plan, workMinutes: Number(e.target.value) })} /></label>
        <label>Перерыв, минут<input id="break" type="number" min={1} max={15} value={plan.breakMinutes} onChange={(e) => setPlan({ ...plan, breakMinutes: Number(e.target.value) })} /></label>
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="eyebrow">Приёмы для учителя</legend>
        {techniques.map((t) => (
          <label key={t.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, color: "var(--fg)" }}>
            <input
              type="checkbox"
              style={{ width: 20, minHeight: 20 }}
              checked={plan.techniqueIds.includes(t.id)}
              onChange={(e) => setPlan({ ...plan, techniqueIds: e.target.checked ? [...plan.techniqueIds, t.id] : plan.techniqueIds.filter((x) => x !== t.id) })}
            />
            {t.title} <span className="pill">{EV[t.evidence]}</span>
          </label>
        ))}
      </fieldset>

      {errors.length > 0 && <ul className="msg err" style={{ margin: 0, paddingLeft: 28 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="row">
        <button className="btn primary" type="button" disabled={pending || errors.length > 0} onClick={submit}>Отправить родителю на согласование</button>
      </div>
      {msg?.error && <p className="msg err" role="alert">{msg.error}</p>}
    </div>
  );
}
