"use client";

import { useEffect, useRef, useState } from "react";
import { SOUND_DEFAULT_VOLUME, SOUND_ICON, SOUND_MAX_VOLUME, SOUNDS, type Sound, type SoundDay } from "@/lib/domain";
import { setNoisePlaying } from "@/lib/sound-state";
import { useI18n } from "@/lib/i18n/client";

const SECONDS = 4;

/** Four seconds of noise of the given colour, looped by the player. Generated in the browser, no files. */
function makeBuffer(ctx: AudioContext, kind: Sound): AudioBuffer {
  const len = ctx.sampleRate * SECONDS;
  const buf = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const out = buf.getChannelData(ch);
    // Pink noise by Paul Kellet's filter; brown noise by integrating white noise.
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === "white") out[i] = w * 0.5;
      else if (kind === "brown") {
        last = (last + 0.02 * w) / 1.02;
        out[i] = last * 3.5;
      } else {
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        const pink = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
        out[i] = pink;
      }
    }
    if (kind === "rain") {
      // Drops: short soft clicks scattered over a softened pink hiss.
      for (let i = 1; i < len; i++) out[i] = out[i] * 0.6 + out[i - 1] * 0.25;
      const drops = SECONDS * 140;
      for (let d = 0; d < drops; d++) {
        const at = Math.floor(Math.random() * (len - 400));
        const amp = 0.05 + Math.random() * 0.15;
        for (let k = 0; k < 400; k++) out[at + k] += amp * Math.exp(-k / 50) * (Math.random() * 2 - 1);
      }
    }
  }
  return buf;
}

/**
 * A quiet background-sound mixer for doing homework. Volume is capped, and the sound fades in and out.
 * During the experiment it tells the child whether today is a day with sound or a quiet day.
 */
export function SoundPlayer({ initial, day }: { initial: Sound; day: SoundDay | null }) {
  const { t } = useI18n();
  const [kind, setKind] = useState<Sound>(initial);
  const [volume, setVolume] = useState(SOUND_DEFAULT_VOLUME);
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const srcRef = useRef<AudioBufferSourceNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);

  function stop() {
    const ctx = ctxRef.current;
    const src = srcRef.current;
    if (ctx && src && gainRef.current) {
      gainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.15);
      setTimeout(() => src.stop(), 600);
    }
    srcRef.current = null;
    setOn(false);
    setNoisePlaying(false);
  }

  function play(k: Sound) {
    if (srcRef.current) stop();
    const ctx = ctxRef.current ?? new AudioContext();
    ctxRef.current = ctx;
    void ctx.resume();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.gain.setTargetAtTime(Math.min(volume, SOUND_MAX_VOLUME), ctx.currentTime, 0.4);
    gain.connect(ctx.destination);
    const src = ctx.createBufferSource();
    src.buffer = makeBuffer(ctx, k);
    src.loop = true;
    src.connect(gain);
    src.start();
    srcRef.current = src;
    gainRef.current = gain;
    setOn(true);
    setNoisePlaying(true);
  }

  useEffect(() => {
    const ctx = ctxRef.current;
    if (ctx && gainRef.current && srcRef.current) gainRef.current.gain.setTargetAtTime(Math.min(volume, SOUND_MAX_VOLUME), ctx.currentTime, 0.1);
  }, [volume]);

  useEffect(() => () => {
    srcRef.current?.stop();
    setNoisePlaying(false);
    void ctxRef.current?.close();
  }, []);

  return (
    <div className="stack sound">
      {day === "SOUND" && <p className="msg ok">{t("snd.daySound", { sound: t(`snd.kind.${kind}`) })}</p>}
      {day === "QUIET" && <p className="msg">{t("snd.dayQuiet")}</p>}
      <div className="chips" role="radiogroup" aria-label={t("snd.pick")}>
        {SOUNDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={kind === s}
            className={`chip ${kind === s ? "on" : ""}`}
            onClick={() => {
              setKind(s);
              if (on) play(s);
            }}
          >
            <span aria-hidden="true">{SOUND_ICON[s]}</span> {t(`snd.kind.${s}`)}
          </button>
        ))}
      </div>
      <div className="row">
        <button className={`btn ${on ? "" : "primary"}`} type="button" onClick={() => (on ? stop() : play(kind))} aria-pressed={on}>
          {on ? t("snd.stop") : t("snd.play")}
        </button>
        <label className="row small" style={{ gap: 8 }}>
          {t("snd.volume")}
          <input
            type="range"
            min={0}
            max={SOUND_MAX_VOLUME}
            step={0.02}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            aria-valuetext={`${Math.round((volume / SOUND_MAX_VOLUME) * 100)}%`}
          />
        </label>
      </div>
      <p className="muted small">{t("snd.hint")}</p>
    </div>
  );
}
