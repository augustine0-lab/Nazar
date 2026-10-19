"use client";

import { useState } from "react";
import { SpeakButton } from "./SpeakButton";
import { useI18n } from "@/lib/i18n/client";

/** One step at a time, big picture and short text, with a button to hear it. */
export function StoryViewer({ title, steps }: { title: string; steps: { icon: string; text: string }[] }) {
  const { t, L } = useI18n();
  const [i, setI] = useState(0);
  const finished = i >= steps.length;
  const step = steps[Math.min(i, steps.length - 1)];
  return (
    <section className="card story" aria-live="polite">
      <h1>{L(title)}</h1>
      {finished ? (
        <div className="story-step">
          <span className="story-pic" aria-hidden="true">🌟</span>
          <p className="story-text">{t("story.done")}</p>
        </div>
      ) : (
        <div className="story-step">
          <span className="eyebrow">{t("story.step", { n: i + 1, total: steps.length })}</span>
          <span className="story-pic" aria-hidden="true">{step.icon}</span>
          <p className="story-text">{L(step.text)}</p>
          <SpeakButton key={i} text={L(step.text)} />
        </div>
      )}
      <div className="story-dots" aria-hidden="true">
        {steps.map((_, j) => <i key={j} className={j < i ? "done" : j === i ? "now" : ""} />)}
      </div>
      <div className="row between">
        <button type="button" className="btn" onClick={() => setI(Math.max(0, i - 1))} disabled={i === 0}>{t("story.prev")}</button>
        {finished ? (
          <button type="button" className="btn primary" onClick={() => setI(0)}>{t("story.again")}</button>
        ) : (
          <button type="button" className="btn primary" onClick={() => setI(i + 1)}>{t("story.next")}</button>
        )}
      </div>
    </section>
  );
}
