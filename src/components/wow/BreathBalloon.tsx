"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { BREATHS_GOAL, BREATH_START, balloonFill, blowLevel, breathStep, noiseFloor, type BreathEvent, type BreathState } from "@/lib/domain/wow";
import { useI18n } from "@/lib/i18n/client";
import { useMic } from "./useMic";

/** The first frames the microphone hears are the room: the child is asked to be quiet for a moment. */
const CALIBRATE_MS = 900;
/** Without a microphone, a held button stands for a gentle breath out. */
const HOLD_LEVEL = 0.5;

const HINT: Record<Exclude<BreathEvent, null>, "bl.good" | "bl.short" | "bl.strong" | "bl.done"> = {
  breath: "bl.good",
  short: "bl.short",
  strong: "bl.strong",
  done: "bl.done",
};

/**
 * «Надуй шарик»: five long, even breaths out into the microphone fill a balloon. A sharp puff does nothing,
 * blowing too hard makes the balloon wait. The sound is only measured, never recorded.
 */
export function BreathBalloon({ onDone, compact = false }: { onDone?: () => void; compact?: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(!compact);
  const [state, setState] = useState<BreathState>(BREATH_START);
  const [hint, setHint] = useState<string | null>(null);
  const [mode, setMode] = useState<"mic" | "hold" | null>(null);
  const [calibrating, setCalibrating] = useState(false);
  const [blowing, setBlowing] = useState(false);
  const st = useRef(state);
  const floor = useRef<number[]>([]);
  const heard = useRef(0);
  const holding = useRef(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;

  const feed = useCallback(
    (level: number, dt: number) => {
      const step = breathStep(st.current, level, dt);
      st.current = step.state;
      setState(step.state);
      setBlowing(step.state.phase === "blow");
      if (step.event) setHint(t(HINT[step.event]));
      if (step.event === "done") doneRef.current?.();
    },
    [t],
  );

  const mic = useMic((level, dt) => {
    if (heard.current < CALIBRATE_MS) {
      heard.current += dt;
      floor.current.push(level);
      if (heard.current >= CALIBRATE_MS) setCalibrating(false);
      return;
    }
    feed(blowLevel(level, noiseFloor(floor.current)), dt);
  });

  // Hold mode: the button is the breath.
  useEffect(() => {
    if (mode !== "hold") return;
    let last = performance.now();
    const id = setInterval(() => {
      const now = performance.now();
      feed(holding.current ? HOLD_LEVEL : 0, now - last);
      last = now;
    }, 50);
    return () => clearInterval(id);
  }, [mode, feed]);

  const done = state.breaths >= BREATHS_GOAL;
  const stopMic = mic.stop;
  useEffect(() => {
    if (done) stopMic();
  }, [done, stopMic]);

  function reset() {
    st.current = BREATH_START;
    setState(BREATH_START);
    setHint(null);
  }

  async function startMic() {
    reset();
    floor.current = [];
    heard.current = 0;
    setCalibrating(true);
    setMode("mic");
    await mic.start();
  }

  function startHold() {
    mic.stop();
    reset();
    setCalibrating(false);
    setMode("hold");
  }

  function close() {
    mic.stop();
    setMode(null);
    reset();
    if (compact) setOpen(false);
  }

  const micFailed = mode === "mic" && mic.error;
  useEffect(() => {
    if (micFailed) setMode(null);
  }, [micFailed]);

  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <span aria-hidden="true">🎈</span> {t("bl.open")}
      </button>
    );

  const fill = balloonFill(state);
  const scale = 0.3 + 0.7 * fill;
  const strong = state.phase === "blow" && state.strongMs > 300;
  const running = mode !== null && !done;

  return (
    <section className="balloon-panel" aria-labelledby="bl-title">
      <h3 id="bl-title"><span aria-hidden="true">🎈</span> {t("bl.title")}</h3>
      {!running && !done && (
        <>
          <p>{t("bl.lead", { n: BREATHS_GOAL })}</p>
          {mic.error && <p role="alert">{t(`bl.err.${mic.error}`)}</p>}
          <p className="muted small">{t("bl.private")}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={startMic}>{t("bl.startMic")}</button>
            <button type="button" className="btn" onClick={startHold}>{t("bl.startHold")}</button>
            {compact && <button type="button" className="btn quiet" onClick={close}>{t("bl.later")}</button>}
          </div>
        </>
      )}

      {(running || done) && (
        <div className="balloon-stage">
          <svg
            className={`balloon${blowing ? " blowing" : ""}${strong ? " strong" : ""}${done ? " away" : ""}`}
            viewBox="0 0 200 260"
            role="img"
            aria-label={t("bl.aria", { n: state.breaths, total: BREATHS_GOAL })}
          >
            <defs>
              <radialGradient id="bl-grad" cx="0.38" cy="0.32" r="0.75">
                <stop offset="0" stopColor="#ffd6e8" />
                <stop offset="0.45" stopColor="#ff7eb3" />
                <stop offset="1" stopColor="#d6457f" />
              </radialGradient>
            </defs>
            <g className="balloon-body" style={{ transform: `scale(${scale})` }}>
              <path d="M100 30 C150 30 172 75 172 112 C172 160 132 192 100 196 C68 192 28 160 28 112 C28 75 50 30 100 30 Z" fill="url(#bl-grad)" />
              <ellipse cx="74" cy="78" rx="14" ry="22" fill="#fff" opacity="0.45" transform="rotate(-24 74 78)" />
              <path d="M94 196 L106 196 L100 206 Z" fill="#d6457f" />
            </g>
            <path className="balloon-string" d="M100 206 C92 222 108 236 100 258" fill="none" stroke="var(--muted)" strokeWidth="2" />
          </svg>
          <ol className="breath-dots" aria-hidden="true">
            {Array.from({ length: BREATHS_GOAL }, (_, k) => <li key={k} className={k < state.breaths ? "on" : ""} />)}
          </ol>
          <p className="balloon-note" role="status" aria-live="polite">
            {done ? t("bl.done") : calibrating ? t("bl.quiet") : hint ?? (mode === "hold" ? t("bl.holdHint") : t("bl.blowHint"))}
          </p>
          {mode === "hold" && !done && (
            <button
              type="button"
              className={`btn primary breath-hold${blowing ? " on" : ""}`}
              onPointerDown={(e) => { e.currentTarget.setPointerCapture?.(e.pointerId); holding.current = true; }}
              onPointerUp={() => { holding.current = false; }}
              onPointerCancel={() => { holding.current = false; }}
              onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); holding.current = true; } }}
              onKeyUp={() => { holding.current = false; }}
            >
              {t("bl.hold")}
            </button>
          )}
          <div className="row">
            {done ? (
              <button type="button" className="btn" onClick={() => { reset(); setMode(null); }}>{t("bl.again")}</button>
            ) : (
              <button type="button" className="btn quiet" onClick={close}>{t("bl.stop")}</button>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
