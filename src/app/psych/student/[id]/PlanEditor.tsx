"use client";

import { useState, useTransition } from "react";
import { dismissProposalAction, submitPlanAction } from "@/app/actions";
import { MAX_GOALS, validatePlan } from "@/lib/domain";
import { msgText } from "@/lib/i18n";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n";

type Goal = { adultText: string; childText: string; place: "SCHOOL" | "HOME"; lineageId: string | null };
type Init = { thresholdPct: number; workMinutes: number; breakMinutes: number; goals: Goal[]; techniqueIds: string[] };

/** Templates are message keys, so they are offered in the language the psychologist reads. */
const TEMPLATES: { key: string; place: Goal["place"] }[] = [
  { key: "start", place: "SCHOOL" },
  { key: "hand", place: "SCHOOL" },
  { key: "diary", place: "SCHOOL" },
  { key: "stay", place: "SCHOOL" },
  { key: "instr", place: "SCHOOL" },
  { key: "bag", place: "HOME" },
];
type Evidence = "STRONG" | "MODERATE" | "PRACTICE";
type Proposal = { id: string; adultText: string; childText: string; place: Goal["place"]; reason: string; from: string };

export function PlanEditor({
  studentId,
  initial,
  techniques,
  proposals = [],
}: {
  studentId: string;
  initial: Init;
  techniques: { id: string; title: string; evidence: Evidence }[];
  proposals?: Proposal[];
}) {
  const { lang, t } = useI18n();
  const [plan, setPlan] = useState(initial);
  const [open, setOpen] = useState(proposals);
  const [adopted, setAdopted] = useState<string[]>([]);
  const [propError, setPropError] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok?: string; error?: string } | null>(null);
  const [pending, start] = useTransition();
  const errors = validatePlan(plan).map((m) => msgText(lang, m));
  const template = (i: number) => ({ adultText: t(`demo.goal.${TEMPLATES[i].key}.adult` as MsgKey), childText: t(`demo.goal.${TEMPLATES[i].key}.child` as MsgKey) });

  const setGoal = (i: number, patch: Partial<Goal>) => setPlan({ ...plan, goals: plan.goals.map((g, j) => (j === i ? { ...g, ...patch } : g)) });

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await submitPlanAction({ studentId, ...plan, adoptedProposalIds: adopted });
      setMsg(res);
      if (res?.ok) setAdopted([]);
    });
  }

  // A proposal taken into the plan is marked adopted only when the plan is sent.
  function take(p: Proposal) {
    setPlan({ ...plan, goals: [...plan.goals, { adultText: p.adultText, childText: p.childText, place: p.place, lineageId: null }] });
    setAdopted([...adopted, p.id]);
    setOpen(open.filter((x) => x.id !== p.id));
  }

  function dismiss(p: Proposal) {
    setPropError(null);
    start(async () => {
      const res = await dismissProposalAction(studentId, p.id);
      if (res?.error) setPropError(res.error);
      else setOpen(open.filter((x) => x.id !== p.id));
    });
  }

  return (
    <div className="stack">
      {(open.length > 0 || adopted.length > 0) && (
        <div className="card proposals" style={{ padding: 12 }}>
          <span className="eyebrow">{t("prop.forPsych")}</span>
          {open.map((p) => (
            <div key={p.id} className="stack" style={{ gap: 4 }}>
              <b>{p.adultText}</b>
              <span className="small">«{p.childText}» · {p.place === "HOME" ? t("pe.home") : t("pe.school")}</span>
              <span className="muted small">{p.from}{p.reason ? ` · ${t("prop.why", { reason: p.reason })}` : ""}</span>
              <div className="row">
                <button type="button" className="btn" disabled={plan.goals.length >= MAX_GOALS} onClick={() => take(p)}>{t("prop.take")}</button>
                <button type="button" className="btn quiet" disabled={pending} onClick={() => dismiss(p)}>{t("prop.dismiss")}</button>
              </div>
            </div>
          ))}
          {open.length > 0 && plan.goals.length >= MAX_GOALS && <p className="muted small">{t("prop.full", { max: MAX_GOALS })}</p>}
          {adopted.length > 0 && <p className="msg ok small" role="status">{t("prop.taken")}</p>}
          {propError && <p className="msg err" role="alert">{propError}</p>}
        </div>
      )}
      {plan.goals.map((g, i) => (
        <fieldset key={i} className="card" style={{ padding: 12, gap: 8 }}>
          <legend className="eyebrow">{t("pe.goalN", { n: i + 1 })}</legend>
          <div className="form-grid">
            <label>{t("pe.adult")}<input id={`goal-${i}-adult`} value={g.adultText} onChange={(e) => setGoal(i, { adultText: e.target.value })} /></label>
            <label>{t("pe.child")}<input id={`goal-${i}-child`} value={g.childText} onChange={(e) => setGoal(i, { childText: e.target.value })} /></label>
            <label>{t("pe.where")}
              <select id={`goal-${i}-place`} value={g.place} onChange={(e) => setGoal(i, { place: e.target.value as Goal["place"] })}>
                <option value="SCHOOL">{t("pe.school")}</option>
                <option value="HOME">{t("pe.home")}</option>
              </select>
            </label>
            <button type="button" className="btn quiet danger" onClick={() => setPlan({ ...plan, goals: plan.goals.filter((_, j) => j !== i) })}>{t("pe.remove")}</button>
          </div>
        </fieldset>
      ))}
      {plan.goals.length < MAX_GOALS && (
        <div className="row">
          <button type="button" className="btn" onClick={() => setPlan({ ...plan, goals: [...plan.goals, { adultText: "", childText: "", place: "SCHOOL", lineageId: null }] })}>{t("pe.addGoal")}</button>
          <select aria-label={t("pe.templateAria")} value="" onChange={(e) => {
            const i = Number(e.target.value);
            if (TEMPLATES[i]) setPlan({ ...plan, goals: [...plan.goals, { ...template(i), place: TEMPLATES[i].place, lineageId: null }] });
          }}>
            <option value="">{t("pe.template")}</option>
            {TEMPLATES.map((_, i) => <option key={i} value={i}>{template(i).adultText}</option>)}
          </select>
        </div>
      )}

      <div className="form-grid">
        <label>{t("pe.threshold", { n: plan.thresholdPct })}
          <input id="threshold" type="range" min={50} max={90} step={5} value={plan.thresholdPct} onChange={(e) => setPlan({ ...plan, thresholdPct: Number(e.target.value) })} />
        </label>
        <label>{t("pe.work")}<input id="work" type="number" min={3} max={30} value={plan.workMinutes} onChange={(e) => setPlan({ ...plan, workMinutes: Number(e.target.value) })} /></label>
        <label>{t("pe.break")}<input id="break" type="number" min={1} max={15} value={plan.breakMinutes} onChange={(e) => setPlan({ ...plan, breakMinutes: Number(e.target.value) })} /></label>
      </div>

      <fieldset className="stack" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="eyebrow">{t("pe.techniques")}</legend>
        {techniques.map((tq) => (
          <label key={tq.id} style={{ flexDirection: "row", alignItems: "center", gap: 8, color: "var(--fg)" }}>
            <input
              type="checkbox"
              style={{ width: 20, minHeight: 20 }}
              checked={plan.techniqueIds.includes(tq.id)}
              onChange={(e) => setPlan({ ...plan, techniqueIds: e.target.checked ? [...plan.techniqueIds, tq.id] : plan.techniqueIds.filter((x) => x !== tq.id) })}
            />
            {tq.title} <span className="pill">{t(`ev.${tq.evidence}`)}</span>
          </label>
        ))}
      </fieldset>

      {errors.length > 0 && <ul className="msg err" style={{ margin: 0, paddingLeft: 28 }}>{errors.map((e) => <li key={e}>{e}</li>)}</ul>}
      <div className="row">
        <button className="btn primary" type="button" disabled={pending || errors.length > 0} onClick={submit}>{t("pe.submit")}</button>
      </div>
      {msg?.error && <p className="msg err" role="alert">{msg.error}</p>}
    </div>
  );
}
