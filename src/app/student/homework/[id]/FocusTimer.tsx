"use client";

import { useEffect, useRef, useState } from "react";
import { selfCheckAction } from "@/app/actions";
import { selfCheckAt, timerState } from "@/lib/domain";

const CIRC = 2 * Math.PI * 60;
const fmt = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Work/break timer derived from the start time; asks one self-check question per work block. */
export function FocusTimer({ studentId, homeworkId, workMin, breakMin }: { studentId: string; homeworkId: string; workMin: number; breakMin: number }) {
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [pausedElapsed, setPausedElapsed] = useState(0);
  const [now, setNow] = useState(() => Date.now());
  const [ask, setAsk] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const askedCycle = useRef(-1);
  const askAt = useRef(selfCheckAt(workMin));

  const running = startedAt !== null;
  const elapsed = running ? pausedElapsed + (now - startedAt) / 1000 : pausedElapsed;
  const st = timerState(elapsed, workMin, breakMin);
  const total = (st.phase === "WORK" ? workMin : breakMin) * 60;

  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [running]);

  useEffect(() => {
    const intoWork = workMin * 60 - st.remainingSec;
    if (running && st.phase === "WORK" && intoWork >= askAt.current && askedCycle.current !== st.cycle) {
      askedCycle.current = st.cycle;
      askAt.current = selfCheckAt(workMin);
      setAsk(true);
    }
  }, [running, st.phase, st.remainingSec, st.cycle, workMin]);

  function toggle() {
    if (running) {
      setPausedElapsed(elapsed);
      setStartedAt(null);
    } else {
      setNow(Date.now());
      setStartedAt(Date.now());
    }
  }

  async function answer(onTask: boolean) {
    setAsk(false);
    const res = await selfCheckAction(studentId, homeworkId, onTask);
    if ("error" in res) setMessage(res.error);
    else setMessage(onTask ? (res.starAwarded ? "Молодец! +1 звезда за самоконтроль." : "Молодец! Ты хорошо следишь за собой.") : "Ничего страшного. Вернись к текущему шагу.");
  }

  return (
    <div className="timer">
      <svg className={`ring ${st.phase === "BREAK" ? "break" : ""}`} viewBox="0 0 148 148" aria-hidden="true">
        <circle className="track" cx="74" cy="74" r="60" />
        <circle className="prog" cx="74" cy="74" r="60" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - st.remainingSec / total)} />
        <text x="74" y="80" textAnchor="middle">{fmt(st.remainingSec)}</text>
        <text x="74" y="100" textAnchor="middle" className="lbl">{st.phase === "WORK" ? "работаю" : "перерыв"}</text>
      </svg>
      <div className="stack" style={{ minWidth: 0 }}>
        <p className="sr-only" aria-live="polite">{st.phase === "WORK" ? "Время работать" : "Перерыв"}</p>
        <div className="row">
          <button className="btn primary" type="button" onClick={toggle}>{running ? "Пауза" : elapsed > 0 ? "Продолжить" : "Начать"}</button>
          <button className="btn" type="button" onClick={() => { setStartedAt(null); setPausedElapsed(0); setAsk(false); }}>Сначала</button>
        </div>
        <p className="muted small">{workMin} минут работы, потом {breakMin} минуты перерыв. В перерыв можно встать и потянуться.</p>
        {ask && (
          <div className="check-in" role="alertdialog" aria-label="Самопроверка">
            <b>Я сейчас занимаюсь заданием?</b>
            <div className="row">
              <button className="btn primary" type="button" onClick={() => answer(true)}>Да</button>
              <button className="btn" type="button" onClick={() => answer(false)}>Отвлёкся</button>
            </div>
          </div>
        )}
        {message && <p className="msg ok" role="status">{message}</p>}
      </div>
    </div>
  );
}
