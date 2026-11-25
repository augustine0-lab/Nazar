"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Emoji } from "@/components/ui/Emoji";
import { chooseRecapGoalAction } from "@/app/actions";
import type { RecapSlide } from "@/lib/domain/wow";
import { PET_EMOJI } from "@/lib/icons";
import { useI18n } from "@/lib/i18n/client";

/** Seconds a story stays before the next one; the last one waits for the child. */
const STORY_MS = 6500;

function useCount(n: number, active: boolean) {
  const [v, setV] = useState(0);
  useEffect(() => {
    if (!active) return;
    if (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
      setV(n);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - t0) / 1200);
      setV(Math.round(n * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    setV(0);
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n, active]);
  return v;
}

function Big({ n, active }: { n: number; active: boolean }) {
  return <span className="rc-big num">{useCount(n, active)}</span>;
}

/**
 * «Моя четверть в сторис»: the quarter told back to the child in a few animated screens, built only from what
 * grew. Tap the right side for the next story, the left side for the one before; holding a finger pauses.
 */
export function RecapStories({
  name,
  period,
  slides,
  goals,
  studentId,
  canChoose,
}: {
  name: string;
  period: string;
  slides: RecapSlide[];
  goals: { id: string; text: string }[];
  studentId: string;
  canChoose: boolean;
}) {
  const { t } = useI18n();
  const [k, setK] = useState(0);
  const [paused, setPaused] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const last = k === slides.length - 1;
  const ref = useRef<HTMLDivElement>(null);

  const go = useCallback((n: number) => setK((x) => Math.max(0, Math.min(slides.length - 1, x + n))), [slides.length]);

  useEffect(() => {
    if (paused || last) return;
    const id = setTimeout(() => go(1), STORY_MS);
    return () => clearTimeout(id);
  }, [k, paused, last, go]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") go(1);
      if (e.key === "ArrowLeft") go(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  async function choose(goalId: string) {
    setBusy(true);
    setError(null);
    const res = await chooseRecapGoalAction({ studentId, goalId });
    setBusy(false);
    if (res.ok) setChosen(res.goal);
    else setError(res.error);
  }

  const s = slides[k];
  const body = (slide: RecapSlide, active: boolean) => {
    switch (slide.kind) {
      case "hello":
        return (<><span className="rc-pic" aria-hidden="true"><Emoji e="🎬" /></span><h2>{t("rc.hello", { name })}</h2><p>{period}</p></>);
      case "stars":
        return (<><span className="rc-pic rain" aria-hidden="true"><Emoji e="⭐" /></span><Big n={slide.n} active={active} /><p>{t("rc.stars")}</p></>);
      case "steps":
        return (<><span className="rc-pic" aria-hidden="true"><Emoji e="📝" /></span><Big n={slide.n} active={active} /><p>{t("rc.steps")}</p></>);
      case "streak":
        return (<><span className="rc-pic" aria-hidden="true"><Emoji e="🔥" /></span><Big n={slide.n} active={active} /><p>{t("rc.streak")}</p></>);
      case "weekday":
        return (<><span className="rc-pic" aria-hidden="true"><Emoji e="💪" /></span><p>{t("rc.weekdayLead")}</p><h2 className="rc-word">{t(`rc.day.${slide.day}` as "rc.day.1")}</h2><p>{t("rc.weekdayTail")}</p></>);
      case "growth":
        return (
          <>
            <span className="rc-pic" aria-hidden="true"><Emoji e="🌱" /></span>
            <p>{t("rc.growthLead")}</p>
            <h2 className="rc-quote">«{slide.text}»</h2>
            <div className="rc-grow" aria-label={t("rc.growthAria", { from: Math.round(slide.from * 100), to: Math.round(slide.to * 100) })}>
              <span className="from" style={{ width: `${Math.round(slide.from * 100)}%` }}>{Math.round(slide.from * 100)}%</span>
              <span className={`to${active ? " on" : ""}`} style={{ "--to": `${Math.round(slide.to * 100)}%` } as React.CSSProperties}>{Math.round(slide.to * 100)}%</span>
            </div>
            <p className="small">{t("rc.growthTail")}</p>
          </>
        );
      case "focus":
        return (<><span className="rc-pic" aria-hidden="true"><Emoji e="🎯" /></span><Big n={slide.n} active={active} /><p>{t("rc.focus")}</p></>);
      case "moods":
        return (<><span className="rc-pic" aria-hidden="true"><Emoji e="😄" /></span><Big n={slide.n} active={active} /><p>{t("rc.moods")}</p></>);
      case "pet":
        return (
          <>
            <span className="rc-pic pet" aria-hidden="true"><Emoji e={PET_EMOJI[slide.petKind as keyof typeof PET_EMOJI] ?? "🐾"} /></span>
            <h2>{t("rc.pet", { name: slide.name })}</h2>
            <p>{t("rc.petStage", { n: slide.stage + 1 })}</p>
          </>
        );
      case "next":
        return (
          <>
            <span className="rc-pic" aria-hidden="true"><Emoji e="🚀" /></span>
            <h2>{t(canChoose && goals.length ? "rc.nextAsk" : "rc.end")}</h2>
            {canChoose && goals.length > 0 && !chosen && (
              <div className="rc-goals">
                {goals.map((g) => (
                  <button key={g.id} type="button" className="btn" disabled={busy} onClick={(e) => { e.stopPropagation(); void choose(g.id); }}>{g.text}</button>
                ))}
              </div>
            )}
            {chosen && <p role="status" className="rc-sent">{t("rc.sent", { goal: chosen })}</p>}
            {error && <p role="alert">{error}</p>}
            <button type="button" className="btn quiet" onClick={(e) => { e.stopPropagation(); setK(0); setChosen(null); }}>{t("rc.again")}</button>
          </>
        );
    }
  };

  return (
    <div
      ref={ref}
      className={`rc rc-${s.kind}`}
      onPointerDown={() => setPaused(true)}
      onPointerUp={() => setPaused(false)}
      onPointerLeave={() => setPaused(false)}
    >
      <div className="rc-bars" aria-hidden="true">
        {slides.map((_, j) => (
          <span key={j} className={j < k ? "done" : j === k ? `now${paused ? " paused" : ""}` : ""} style={{ "--story": `${STORY_MS}ms` } as React.CSSProperties} />
        ))}
      </div>
      <div className="rc-slide" key={k} aria-live="polite">
        {body(s, true)}
      </div>
      {!last && <button type="button" className="rc-tap next" aria-label={t("rc.next")} onClick={() => go(1)} />}
      {k > 0 && <button type="button" className="rc-tap prev" aria-label={t("rc.prev")} onClick={() => go(-1)} />}
      <span className="sr-only">{t("rc.count", { n: k + 1, total: slides.length })}</span>
    </div>
  );
}
