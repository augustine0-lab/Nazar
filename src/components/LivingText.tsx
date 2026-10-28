"use client";

import "@fontsource/pt-serif/400.css";
import "@fontsource/pt-serif/700.css";
import { useEffect, useMemo, useRef, useState } from "react";
import { SceneArt } from "./SceneArt";
import { SpeakButton } from "./SpeakButton";
import { readingSeconds, sentences, type Chapter } from "@/lib/domain/reading";
import { useI18n } from "@/lib/i18n/client";

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const two = (n: number) => String(n).padStart(2, "0");

/**
 * A reading in short chapters: the contents on the left with a progress line, a big picture, and one chapter
 * of text below it. Play turns the chapters by themselves at a calm pace and lights up the sentence to read now;
 * the reader can pause or jump to any chapter. Nothing starts until the reader presses play.
 */
export function LivingText({ id, title, source, chapters, projector = false }: { id: string; title: string; source: string; chapters: Chapter[]; projector?: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const durs = useMemo(() => chapters.map((c) => readingSeconds(c.text)), [chapters]);
  const total = durs.reduce((a, b) => a + b, 0);
  const [i, setI] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const finished = i === chapters.length - 1 && elapsed >= durs[i];

  useEffect(() => {
    if (!playing) return;
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setElapsed((e) => e + dt);
    }, 100);
    return () => clearInterval(tick);
  }, [playing]);

  // Turn the page when the chapter's time is up; stop after the last one.
  useEffect(() => {
    if (elapsed < durs[i]) return;
    if (i < chapters.length - 1) {
      setI(i + 1);
      setElapsed(0);
    } else {
      setElapsed(durs[i]);
      setPlaying(false);
    }
  }, [elapsed, i, durs, chapters.length]);

  // On a phone the contents scroll sideways: keep the current chapter in view.
  useEffect(() => {
    const list = listRef.current;
    const li = list?.children[i] as HTMLElement | undefined;
    if (list && li && list.scrollWidth > list.clientWidth) list.scrollTo({ left: li.offsetLeft - list.offsetLeft - 16, behavior: "smooth" });
  }, [i]);

  const go = (k: number) => {
    setI(Math.max(0, Math.min(chapters.length - 1, k)));
    setElapsed(0);
  };
  const toggle = () => {
    if (finished) {
      go(0);
      setPlaying(true);
    } else setPlaying((p) => !p);
    setStarted(true);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else return;
      setStarted(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ch = chapters[i];
  const parts = sentences(ch.text);
  // Which sentence the reader should be on, by the share of words already "read" in this chapter.
  const words = parts.map((s) => s.split(/\s+/).length);
  const all = words.reduce((a, b) => a + b, 0);
  let acc = 0;
  const share = Math.min(1, elapsed / durs[i]);
  const now = started ? Math.max(0, words.findIndex((w) => (acc += w) / all > share)) : -1;
  const spent = durs.slice(0, i).reduce((a, b) => a + b, 0) + Math.min(elapsed, durs[i]);
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())?.catch(() => undefined);
  const name = (k: number) => chapters[k].title || t("read.part", { n: k + 1 });

  return (
    <div className="lt" ref={ref}>
      <header className="lt-head">
        {source && <span className="lt-src">{source}</span>}
        <h1 className="lt-title">{title}</h1>
      </header>

      <div className="lt-stage">
        <aside className="lt-rail" aria-label={t("read.contents")}>
          <button type="button" className="lt-play" onClick={toggle} aria-label={playing ? t("read.pause") : t("read.play")} title={playing ? t("read.pause") : t("read.play")}>
            {playing ? (
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12" rx="1" /><rect x="11.5" y="4" width="3.5" height="12" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4 L16 10 L6 16 Z" /></svg>
            )}
          </button>
          <ol className="lt-list" ref={listRef}>
            {chapters.map((c, k) => {
              const fill = k < i ? 1 : k === i ? Math.min(1, elapsed / durs[k]) : 0;
              return (
                <li key={k} className={k === i ? "now" : k < i ? "past" : ""} style={{ "--fill": fill } as React.CSSProperties}>
                  <button type="button" onClick={() => { go(k); setStarted(true); }} aria-current={k === i ? "step" : undefined}>
                    <span className="num">{two(k + 1)}</span> · {name(k)}
                  </button>
                </li>
              );
            })}
          </ol>
          <span className="lt-time num" aria-label={t("read.time", { now: mmss(spent), total: mmss(total) })}>{mmss(spent)} / {mmss(total)}</span>
        </aside>

        <figure className="lt-pic">
          <SceneArt key={i} scene={ch.scene} uid={`${id}-${i}`} className={playing ? "on" : ""} />
          {finished && (
            <figcaption className="lt-done">
              <span aria-hidden="true">🌟</span> {t("read.done")}
            </figcaption>
          )}
        </figure>
      </div>

      <div className="lt-text" key={`t${i}`} aria-live="polite">
        {chapters[i].title && <h2 className="lt-ch">{chapters[i].title}</h2>}
        <p>
          {parts.map((s, k) => (
            <span key={k} className={now < 0 ? "" : k === now ? "now" : k < now ? "past" : "next"}>{s} </span>
          ))}
        </p>
      </div>

      <div className="lt-controls no-print">
        <button type="button" className="btn" onClick={() => { go(i - 1); setStarted(true); }} disabled={i === 0}>← {t("read.prev")}</button>
        <SpeakButton key={i} text={`${ch.title}. ${ch.text}`} />
        {projector && <button type="button" className="btn quiet" onClick={fullscreen}>⛶ {t("board.fullscreen")}</button>}
        {finished ? (
          <button type="button" className="btn primary" onClick={() => { go(0); setPlaying(false); setStarted(false); }}>{t("read.again")}</button>
        ) : (
          <button type="button" className="btn primary" onClick={() => { if (i === chapters.length - 1) { setElapsed(durs[i]); setPlaying(false); } else go(i + 1); setStarted(true); }}>
            {i === chapters.length - 1 ? t("read.finish") : `${t("read.next")} →`}
          </button>
        )}
      </div>
    </div>
  );
}
