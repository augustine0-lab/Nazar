"use client";

import { I } from "@/components/ui/Icon";
import "@fontsource/pt-serif/400.css";
import "@fontsource/pt-serif/700.css";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SceneArt } from "./SceneArt";
import { SpeakButton } from "./SpeakButton";
import { GazeControl } from "./gaze/GazeControl";
import { useGaze } from "./gaze/useGaze";
import type { Chapter } from "@/lib/domain/reading";
import { SPEEDS, isSpeed, recordedTimeline, sameWord, sentenceJump, silentTimeline, wordAt, type Recording, type Speed, type Timeline } from "@/lib/domain/voice";
import { useI18n } from "@/lib/i18n/client";

const mmss = (sec: number) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
const two = (n: number) => String(n).padStart(2, "0");

// The reader's choices and place stay on this device only; storage can be missing (private window), so every
// read and write is allowed to fail.
const PREFS = "nazar.read.prefs";
const placeKey = (id: string) => `nazar.read.place.${id}`;
function load<T>(key: string): Partial<T> | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Partial<T>) : null;
  } catch {
    return null;
  }
}
function save(key: string, value: unknown) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* nothing to do: the player works without it */
  }
}
interface Prefs {
  speed: Speed;
  captions: boolean;
  voice: boolean;
}
interface Place {
  chapter: number;
  word: number;
}

export type LivingChapter = Chapter & { voice?: Recording };

/**
 * A reading in short chapters: the contents on the left with a progress line, a big picture, and one chapter
 * of text below it. Play turns the chapters by themselves and lights up the word being read inside the
 * sentence being read. When the chapter has a ready recording (the demo texts, in Russian and Kazakh), the
 * voice reads it and the words light up in step with it. The reader can step back or forward one sentence,
 * choose the speed, show captions on the picture, and comes back to the place where they stopped.
 * Nothing starts until the reader presses play.
 *
 * With «Взгляд» on, the camera notices when the reader looks away: the text and the voice stop, the sentence
 * stays lit, and they go on from it once the reader looks back.
 */
export function LivingText({ id, title, source, chapters, projector = false }: { id: string; title: string; source: string; chapters: LivingChapter[]; projector?: boolean }) {
  const { t } = useI18n();
  const ref = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const silent = useMemo(() => chapters.map((c) => silentTimeline(c.text)), [chapters]);
  const recorded = useMemo(() => chapters.map((c) => recordedTimeline(c.title, c.text, c.voice)), [chapters]);
  const anyVoice = recorded.some(Boolean);

  const [speed, setSpeed] = useState<Speed>(1);
  const [captions, setCaptions] = useState(projector);
  const [voiceOn, setVoiceOn] = useState(true);
  const [voiceFailed, setVoiceFailed] = useState(false);
  const useVoice = voiceOn && !voiceFailed;
  const lines: Timeline[] = useMemo(() => chapters.map((_, k) => (useVoice && recorded[k]) || silent[k]), [chapters, useVoice, recorded, silent]);

  const [i, setI] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [started, setStarted] = useState(false);
  const [resume, setResume] = useState<Place | null>(null);
  const tl = lines[i];
  const finished = i === chapters.length - 1 && elapsed >= tl.dur;
  const audible = !!tl.src;

  // Choices and the saved place, read once on this device.
  useEffect(() => {
    const p = load<Prefs>(PREFS);
    if (p) {
      if (isSpeed(p.speed)) setSpeed(p.speed);
      if (typeof p.captions === "boolean") setCaptions(p.captions);
      if (typeof p.voice === "boolean") setVoiceOn(p.voice);
    }
    const place = load<Place>(placeKey(id));
    if (place && typeof place.chapter === "number" && place.chapter >= 0 && place.chapter < chapters.length && (place.chapter > 0 || (place.word ?? 0) > 0))
      setResume({ chapter: place.chapter, word: Math.max(0, place.word ?? 0) });
  }, [id, chapters.length]);
  const prefsReady = useRef(false);
  useEffect(() => {
    if (!prefsReady.current) {
      prefsReady.current = true;
      return;
    }
    save(PREFS, { speed, captions, voice: voiceOn });
  }, [speed, captions, voiceOn]);

  const gaze = useGaze(projector ? "WIDE" : "NEAR");
  // held: the reader looked away and the text is waiting; back: they looked back, the text goes on in a moment.
  const [held, setHeld] = useState(false);
  const [back, setBack] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);
  const wasLooking = useRef(true);
  const resumePlay = useRef(false);
  const playingRef = useRef(playing);
  playingRef.current = playing;
  const heldRef = useRef(held);
  heldRef.current = held;

  useEffect(() => {
    const was = wasLooking.current;
    wasLooking.current = gaze.looking;
    if (was === gaze.looking) return;
    const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
    if (!gaze.looking) {
      setBack(false);
      const speaking = !!synth?.speaking && !synth.paused;
      if (playingRef.current || speaking) {
        resumePlay.current = playingRef.current;
        setPlaying(false);
        if (speaking) synth?.pause();
        setHeld(true);
      }
    } else if (heldRef.current) {
      if (synth?.paused) synth.resume();
      setBack(true);
      textRef.current?.querySelector(".hold")?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [gaze.looking]);

  // A moment to find the line again, then the text goes on by itself.
  useEffect(() => {
    if (!back) return;
    const timer = setTimeout(() => {
      setBack(false);
      setHeld(false);
      if (resumePlay.current) setPlaying(true);
    }, 1400);
    return () => clearTimeout(timer);
  }, [back]);

  // The reader takes over, or the camera is off: nothing is waiting any more.
  const release = () => {
    setHeld(false);
    setBack(false);
  };
  useEffect(() => {
    if (gaze.status !== "on") release();
  }, [gaze.status]);

  // The clock. With a recording the audio is the clock; without one, time runs at the chosen speed.
  const elapsedRef = useRef(elapsed);
  elapsedRef.current = elapsed;
  useEffect(() => {
    const audio = audioRef.current;
    if (!playing) {
      audio?.pause();
      return;
    }
    if (audible && audio) {
      audio.playbackRate = speed;
      if (Math.abs(audio.currentTime - elapsedRef.current) > 0.25) audio.currentTime = elapsedRef.current;
      let frame = 0;
      const follow = () => {
        setElapsed(audio.ended ? tl.dur : audio.currentTime);
        frame = requestAnimationFrame(follow);
      };
      audio.play().then(
        () => (frame = requestAnimationFrame(follow)),
        // The browser would not play the sound (no file, blocked): go on without the voice.
        (e: unknown) => {
          if ((e as Error)?.name !== "AbortError") setVoiceFailed(true);
        },
      );
      return () => {
        cancelAnimationFrame(frame);
        audio.pause();
      };
    }
    let last = performance.now();
    const tick = setInterval(() => {
      const now = performance.now();
      const dt = ((now - last) / 1000) * speed;
      last = now;
      setElapsed((e) => e + dt);
    }, 50);
    return () => clearInterval(tick);
  }, [playing, audible, speed, i, tl.src, tl.dur]);

  // Turn the page when the chapter is over; stop after the last one.
  useEffect(() => {
    if (elapsed < tl.dur) return;
    if (i < chapters.length - 1) {
      setI(i + 1);
      setElapsed(0);
    } else {
      setElapsed(tl.dur);
      setPlaying(false);
    }
  }, [elapsed, i, tl.dur, chapters.length]);

  // On a phone the contents scroll sideways: keep the current chapter in view.
  useEffect(() => {
    const list = listRef.current;
    const li = list?.children[i] as HTMLElement | undefined;
    if (list && li && list.scrollWidth > list.clientWidth) list.scrollTo({ left: li.offsetLeft - list.offsetLeft - 16, behavior: "smooth" });
  }, [i]);

  const seek = useCallback((sec: number) => {
    const x = Math.max(0, sec);
    setElapsed(x);
    const audio = audioRef.current;
    if (audio && audio.src) {
      try {
        audio.currentTime = x;
      } catch {
        /* not loaded yet: the clock effect seeks once it plays */
      }
    }
  }, []);

  const go = (k: number) => {
    release();
    setResume(null);
    setI(Math.max(0, Math.min(chapters.length - 1, k)));
    setElapsed(0);
  };
  const toggle = () => {
    release();
    setResume(null);
    if (finished) {
      go(0);
      setPlaying(true);
    } else setPlaying((p) => !p);
    setStarted(true);
  };
  /** One sentence back or forward; past the last sentence, the next chapter. */
  const step = (dir: -1 | 1) => {
    release();
    setResume(null);
    setStarted(true);
    const to = sentenceJump(tl, elapsed, dir);
    if (to !== null) seek(to);
    else if (i < chapters.length - 1) go(i + 1);
  };
  const switchVoice = () => {
    const next = !voiceOn;
    const from = tl;
    const to = (next && !voiceFailed && recorded[i]) || silent[i];
    setVoiceOn(next);
    seek(sameWord(from, to, elapsed));
  };

  // Remember the place: the chapter and the first word of the sentence being read.
  const w = wordAt(tl, elapsed);
  const sentenceNow = started ? (w < 0 ? 0 : tl.words[w].sentence) : -1;
  useEffect(() => {
    if (!started) return;
    if (finished) save(placeKey(id), null);
    else save(placeKey(id), { chapter: i, word: tl.firsts[Math.max(0, sentenceNow)] ?? 0 });
  }, [id, i, sentenceNow, started, finished, tl.firsts]);
  const continueReading = () => {
    if (!resume) return;
    const k = resume.chapter;
    const line = lines[k];
    setResume(null);
    release();
    setI(k);
    setStarted(true);
    seek(line.words[Math.min(resume.word, line.words.length - 1)]?.start ?? 0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      const tag = el?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el?.isContentEditable) return;
      if (e.key === "ArrowRight" && e.shiftKey) step(1);
      else if (e.key === "ArrowLeft" && e.shiftKey) step(-1);
      else if (e.key === "ArrowRight") go(i + 1);
      else if (e.key === "ArrowLeft") go(i - 1);
      else if (e.key === " " && tag !== "BUTTON" && tag !== "A") {
        e.preventDefault();
        toggle();
        return;
      } else return;
      setStarted(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const ch = chapters[i];
  const spent = lines.slice(0, i).reduce((a, l) => a + l.dur, 0) + Math.min(elapsed, tl.dur);
  const total = lines.reduce((a, l) => a + l.dur, 0);
  const fullscreen = () => (document.fullscreenElement ? document.exitFullscreen() : ref.current?.requestFullscreen())?.catch(() => undefined);
  const name = (k: number) => chapters[k].title || t("read.part", { n: k + 1 });
  const lit = started && w >= 0 && !finished ? w : -1;

  // The chapter's words, sentence by sentence, each in its own span so the one being read can light up.
  const bySentence: { k: number; text: string }[][] = [];
  tl.words.forEach((word, k) => (bySentence[word.sentence] ??= []).push({ k, text: word.text }));
  const caption = sentenceNow >= 0 && !finished ? bySentence[sentenceNow] : undefined;

  return (
    <div className="lt" ref={ref}>
      <header className="lt-head">
        {source && <span className="lt-src">{source}</span>}
        <h1 className="lt-title">{title}</h1>
      </header>

      {resume && (
        <div className="lt-resume" role="status">
          <span>{t("read.resume", { n: resume.chapter + 1, name: name(resume.chapter) })}</span>
          <button type="button" className="btn primary" onClick={continueReading}>{t("read.resumeGo")}</button>
          <button type="button" className="btn quiet" onClick={() => { setResume(null); save(placeKey(id), null); }}>{t("read.resumeStart")}</button>
        </div>
      )}

      <div className="lt-stage">
        <aside className="lt-rail" aria-label={t("read.contents")}>
          <button type="button" className="lt-play" onClick={toggle} aria-label={playing ? t("read.pause") : t(audible ? "read.listen" : "read.play")} title={playing ? t("read.pause") : t(audible ? "read.listen" : "read.play")}>
            {playing ? (
              <svg viewBox="0 0 20 20" aria-hidden="true"><rect x="5" y="4" width="3.5" height="12" rx="1" /><rect x="11.5" y="4" width="3.5" height="12" rx="1" /></svg>
            ) : (
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M6 4 L16 10 L6 16 Z" /></svg>
            )}
          </button>
          <ol className="lt-list" ref={listRef}>
            {chapters.map((c, k) => {
              const fill = k < i ? 1 : k === i ? Math.min(1, elapsed / lines[k].dur) : 0;
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
          {captions && caption && (
            <figcaption className="lt-cc" aria-hidden="true">
              {caption.map((x) => (
                <Fragment key={x.k}><span className={x.k === lit ? "w now" : "w"}>{x.text}</span>{" "}</Fragment>
              ))}
            </figcaption>
          )}
        </figure>
      </div>

      <div className="lt-bar no-print" role="group" aria-label={t("read.player")}>
        <button type="button" className="btn quiet" onClick={() => step(-1)} title={t("read.stepBackHint")}>
          <span aria-hidden="true">↶</span> {t("read.stepBack")}
        </button>
        <button type="button" className="btn quiet" onClick={() => step(1)} title={t("read.stepNextHint")}>
          {t("read.stepNext")} <span aria-hidden="true">↷</span>
        </button>
        <span className="lt-speed" role="radiogroup" aria-label={t("read.speed")}>
          {SPEEDS.map((s) => (
            <button key={s} type="button" role="radio" aria-checked={speed === s} className={speed === s ? "on" : ""} onClick={() => setSpeed(s)}>
              {t(s < 1 ? "read.slow" : s > 1 ? "read.fast" : "read.normal")}
            </button>
          ))}
        </span>
        {anyVoice && !voiceFailed && (
          <button type="button" className="btn quiet" aria-pressed={voiceOn} onClick={switchVoice}>
            <I name={voiceOn ? "speak" : "mute"} /> {t(voiceOn ? "read.voiceOn" : "read.voiceOff")}
          </button>
        )}
        <button type="button" className="btn quiet" aria-pressed={captions} onClick={() => setCaptions((c) => !c)}>
          <span className="lt-cc-icon" aria-hidden="true">CC</span> {t("read.captions")}
        </button>
        {voiceFailed && <span className="muted small" role="status">{t("read.voiceFailed")}</span>}
      </div>

      <div className={`lt-text${held ? " held" : ""}${back ? " back" : ""}`} key={`t${i}`} ref={textRef}>
        {held && (
          <div className="lt-wait" role="status">
            <I name="eye" /> {t(back ? (projector ? "gz.backWide" : "gz.back") : projector ? "gz.heldWide" : "gz.held")}
          </div>
        )}
        {ch.title && <h2 className="lt-ch">{ch.title}</h2>}
        <p>
          {bySentence.map((ws, k) => (
            <span key={k} className={`s ${sentenceNow < 0 ? "" : k === sentenceNow ? `now${held ? " hold" : ""}` : k < sentenceNow ? "past" : "next"}`}>
              {ws.map((x) => (
                <Fragment key={x.k}><span className={x.k === lit ? "w now" : "w"}>{x.text}</span>{" "}</Fragment>
              ))}
            </span>
          ))}
        </p>
      </div>

      <div className="lt-controls no-print">
        <button type="button" className="btn" onClick={() => { go(i - 1); setStarted(true); }} disabled={i === 0}>← {t("read.prev")}</button>
        {!audible && <SpeakButton key={i} text={`${ch.title}. ${ch.text}`} />}
        <GazeControl gaze={gaze} wide={projector} />
        {projector && <button type="button" className="btn quiet" onClick={fullscreen}><I name="fullscreen" /> {t("board.fullscreen")}</button>}
        {finished ? (
          <button type="button" className="btn primary" onClick={() => { go(0); setPlaying(false); setStarted(false); }}>{t("read.again")}</button>
        ) : (
          <button type="button" className="btn primary" onClick={() => { if (i === chapters.length - 1) { setElapsed(tl.dur); setPlaying(false); } else go(i + 1); setStarted(true); }}>
            {i === chapters.length - 1 ? t("read.finish") : `${t("read.next")} →`}
          </button>
        )}
      </div>

      {tl.src && <audio ref={audioRef} src={tl.src} preload="auto" onError={() => setVoiceFailed(true)} />}
    </div>
  );
}
