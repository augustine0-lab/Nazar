"use client";

import { useEffect, useRef, useState } from "react";
import type { BoardStep } from "@/lib/domain/concepts";
import { useI18n } from "@/lib/i18n/client";

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

/**
 * The lesson plan for the whole class on the board: what we do now, how much time is left, what comes next.
 * It runs only in the teacher's browser; nothing about pupils is shown. When time is up it waits for the teacher.
 */
export function LessonBoard({ steps }: { steps: BoardStep[] }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [left, setLeft] = useState(steps[0]?.minutes * 60 || 0);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => setLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [running]);

  if (!steps.length) return <p className="muted">{t("board.empty")}</p>;
  const step = steps[i];
  const total = step.minutes * 60;
  const go = (n: number) => {
    const k = Math.max(0, Math.min(steps.length - 1, n));
    setI(k);
    setLeft(steps[k].minutes * 60);
  };
  const r = 44, circ = 2 * Math.PI * r;
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())?.catch(() => undefined);

  return (
    <div className="stack">
      <div className="row no-print">
        <button className="btn primary" type="button" onClick={() => setRunning((x) => !x)}>{running ? `⏸ ${t("board.pause")}` : `▶ ${t("board.start")}`}</button>
        <button className="btn" type="button" onClick={() => go(i - 1)} disabled={i === 0}>← {t("board.back")}</button>
        <button className="btn" type="button" onClick={() => go(i + 1)} disabled={i === steps.length - 1}>{t("board.next")} →</button>
        <button className="btn" type="button" onClick={fullscreen}>⛶ {t("board.fullscreen")}</button>
      </div>
      <div className="board" ref={ref}>
        <div className="board-now" aria-live="polite">
          <span className="eyebrow">{t("board.now", { n: i + 1, total: steps.length })}</span>
          <span className="pic" aria-hidden="true">{step.icon}</span>
          <span className="ttl">{step.text}</span>
          {left === 0 ? (
            <span className="board-timeup">{t("board.timeUp")}</span>
          ) : (
            i < steps.length - 1 && <span className="board-next">{t("board.then", { text: `${steps[i + 1].icon} ${steps[i + 1].text}` })}</span>
          )}
        </div>
        <svg className="board-ring" viewBox="0 0 100 100" role="timer" aria-label={t("board.left", { time: mmss(left) })}>
          <circle cx="50" cy="50" r={r} fill="none" stroke="var(--surface-2)" strokeWidth="9" />
          <circle
            cx="50" cy="50" r={r} fill="none" stroke={left === 0 ? "var(--star)" : "var(--accent)"} strokeWidth="9" strokeLinecap="round"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - left / total)} transform="rotate(-90 50 50)"
          />
          <text x="50" y="57" textAnchor="middle" fontSize="20">{mmss(left)}</text>
        </svg>
        <ol className="board-steps">
          {steps.map((s, k) => (
            <li key={k} className={k === i ? "now" : k < i ? "past" : ""}>
              <span aria-hidden="true">{s.icon}</span>
              <span>{s.text}</span>
              <span className="min">{t("board.min", { n: s.minutes })}</span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
