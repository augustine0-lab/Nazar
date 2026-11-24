"use client";

import { useRef, useState } from "react";
import { QUIET_GOALS, QUIET_START, TREE_STAGES, loudnessPct, quietStep, smoothMeter, treeStage, type QuietState } from "@/lib/domain/wow";
import { useI18n } from "@/lib/i18n/client";
import { useMic } from "./useMic";

const LEAVES: [number, number, number][] = [
  [70, 118, 1], [130, 112, 1], [92, 92, 2], [112, 84, 2], [58, 96, 2], [142, 92, 3], [100, 70, 3], [78, 74, 3], [124, 66, 3],
];
const BLOSSOMS: [number, number][] = [[66, 104], [134, 100], [100, 62], [84, 84], [118, 78], [52, 88], [148, 84]];

/** The class tree: grows a little with every quiet stretch of the goal, blossoms at the end. */
export function TreeArt({ stage }: { stage: number }) {
  return (
    <svg className="qt-tree" viewBox="0 0 200 200" aria-hidden="true">
      <ellipse cx="100" cy="186" rx="70" ry="9" fill="var(--surface-2)" />
      <path d="M100 186 C98 170 102 156 100 140" stroke="#8a6a4f" strokeWidth={stage >= 1 ? 10 : 4} strokeLinecap="round" fill="none" />
      {stage === 0 && <path d="M100 150 C90 140 88 132 92 128 C98 130 100 140 100 150 C102 138 108 130 114 132 C114 140 108 146 100 150" fill="#5fbf8b" />}
      <g className={stage >= 2 ? "on" : ""}>
        <path d="M100 140 C96 118 84 108 70 100" stroke="#8a6a4f" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M100 140 C104 116 118 104 132 96" stroke="#8a6a4f" strokeWidth="6" strokeLinecap="round" fill="none" />
        <path d="M100 140 C100 112 100 92 100 74" stroke="#8a6a4f" strokeWidth="6" strokeLinecap="round" fill="none" />
      </g>
      {LEAVES.map(([x, y, from], k) => (
        <ellipse key={k} className={stage >= from + 1 ? "leaf on" : "leaf"} cx={x} cy={y} rx="17" ry="12" fill={k % 2 ? "#4fae7c" : "#6cc794"} transform={`rotate(${(k * 37) % 60 - 30} ${x} ${y})`} />
      ))}
      {BLOSSOMS.map(([x, y], k) => (
        <g key={k} className={stage >= TREE_STAGES ? "bloom on" : "bloom"} transform={`translate(${x} ${y})`}>
          {[0, 72, 144, 216, 288].map((a) => <ellipse key={a} cx="0" cy="-5" rx="3.6" ry="5.4" fill="#ffb3cf" transform={`rotate(${a})`} />)}
          <circle r="2.6" fill="#ffd66b" />
        </g>
      ))}
    </svg>
  );
}

/**
 * «Светофор тишины» on the lesson board: the teacher's laptop listens to how loud the class is. A working
 * whisper grows the class tree, real noise makes it wait. No one is singled out, nothing is recorded.
 */
export function QuietTree() {
  const { t } = useI18n();
  const [goal, setGoal] = useState<number>(5);
  const [limit, setLimit] = useState(55);
  const [s, setS] = useState<QuietState>(QUIET_START);
  const [meter, setMeter] = useState(0);
  const level = useRef(0);
  const state = useRef(s);
  const limitRef = useRef(limit);
  limitRef.current = limit;

  const mic = useMic((raw, dt) => {
    level.current = smoothMeter(level.current, loudnessPct(raw), dt);
    state.current = quietStep(state.current, level.current, limitRef.current, dt);
    setS(state.current);
    setMeter(Math.round(level.current));
  });

  const stage = treeStage(s.quietMs, goal);
  const full = stage >= TREE_STAGES;
  const minutes = Math.floor(s.quietMs / 60_000);
  const reset = () => { state.current = QUIET_START; setS(QUIET_START); };

  return (
    <div className="qt">
      <div className={`qt-art${full ? " full" : ""}`}>
        <TreeArt stage={stage} />
        <div className="qt-light" role="img" aria-label={t(`qt.light.${s.light}`)}>
          {(["red", "yellow", "green"] as const).map((c) => <span key={c} className={`lamp ${c}${s.light === c && mic.status === "on" ? " on" : ""}`} />)}
        </div>
      </div>
      <p className="qt-note" role="status" aria-live="polite">
        {mic.status !== "on" ? t("qt.off") : full ? t("qt.bloom") : s.light === "red" ? t("qt.wait") : t("qt.grow", { n: minutes, goal })}
      </p>
      <div className="qt-meter" aria-hidden="true">
        <span className="bar" style={{ width: `${meter}%` }} data-light={s.light} />
        <span className="limit" style={{ left: `${limit}%` }} />
      </div>
      <div className="qt-controls no-print">
        {mic.status === "on" ? (
          <button type="button" className="btn" onClick={mic.stop}>{t("qt.stop")}</button>
        ) : (
          <button type="button" className="btn primary" onClick={mic.start} disabled={mic.status === "loading"}>{t("qt.start")}</button>
        )}
        <label className="qt-goal">
          {t("qt.goal")}{" "}
          <select value={goal} onChange={(e) => setGoal(Number(e.target.value))}>
            {QUIET_GOALS.map((g) => <option key={g} value={g}>{t("board.min", { n: g })}</option>)}
          </select>
        </label>
        <label className="qt-limit">
          {t("qt.limit")}
          <input type="range" min={20} max={90} value={limit} onChange={(e) => setLimit(Number(e.target.value))} />
        </label>
        <button type="button" className="btn quiet" onClick={reset}>{t("qt.reset")}</button>
      </div>
      {mic.error && <p role="alert" className="small">{t(`bl.err.${mic.error}`)}</p>}
      <p className="muted small no-print">{t("qt.private")}</p>
    </div>
  );
}
