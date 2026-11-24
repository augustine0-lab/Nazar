"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { rms } from "@/lib/domain/wow";

export type MicStatus = "off" | "loading" | "on";
export type MicError = "unsupported" | "denied" | "nomic";

/** Frames a second the loudness is read. */
const FPS = 20;

/**
 * The microphone as one number: loudness 0..1 of each frame, handed to `onFrame` with the time since the
 * last frame. Sound is only measured in this tab: nothing is recorded, kept or sent anywhere.
 * Noise suppression is off on purpose: it would take away the very sound of blowing or of a noisy class.
 */
export function useMic(onFrame: (level: number, dtMs: number) => void) {
  const [status, setStatus] = useState<MicStatus>("off");
  const [error, setError] = useState<MicError | null>(null);
  const run = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const frame = useRef(onFrame);
  frame.current = onFrame;

  const stop = useCallback(() => {
    run.current++;
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    setStatus("off");
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      setError("unsupported");
      return;
    }
    stop();
    const id = run.current;
    setStatus("loading");
    try {
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
      if (run.current !== id) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const ac = new AudioContext();
      ctx.current = ac;
      void ac.resume();
      const analyser = ac.createAnalyser();
      analyser.fftSize = 1024;
      ac.createMediaStreamSource(media).connect(analyser);
      const buf = new Float32Array(analyser.fftSize);
      let last = performance.now();
      timer.current = setInterval(() => {
        if (run.current !== id) return;
        analyser.getFloatTimeDomainData(buf);
        const now = performance.now();
        frame.current(rms(buf), now - last);
        last = now;
      }, 1000 / FPS);
      setStatus("on");
    } catch (e) {
      stop();
      const name = (e as { name?: string })?.name;
      setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "nomic");
    }
  }, [stop]);

  return { status, error, start, stop };
}
