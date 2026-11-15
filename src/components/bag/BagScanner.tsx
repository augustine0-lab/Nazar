"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ObjectDetector } from "@mediapipe/tasks-vision";
import { SCAN_LABELS, SCAN_MIN_SCORE, lineForThing, scanStep, type ScanState, type ScanThing } from "@/lib/domain/scan";
import { useI18n } from "@/lib/i18n/client";
import { loadObjectDetector } from "../vision";

export interface ScanLine {
  id: string;
  title: string;
  thing: ScanThing | null;
}

type Status = "off" | "loading" | "on";
type ScanError = "unsupported" | "denied" | "nocamera" | "load";

/** Frames per second the detector looks at. */
const FPS = 8;
const KNOWN = new Set<string>(SCAN_LABELS);

/** A short two-note chime for a found thing; quiet, made in the browser. */
function chime(ctx: AudioContext | null) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [660, 990].forEach((f, k) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = t0 + k * 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.32);
  });
}

/**
 * «Покажи роботу»: the camera looks for the things on the bag list that the detector knows, and a thing
 * held up long enough ticks its line through `onFound`. Frames stay in this tab: nothing is recorded or sent.
 */
export function BagScanner({ lines, done, onFound }: { lines: ScanLine[]; done: ReadonlySet<string>; onFound: (id: string) => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("off");
  const [error, setError] = useState<ScanError | null>(null);
  const [note, setNote] = useState<{ text: string; good: boolean } | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const run = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  // The loop reads the latest list and ticks through refs, so it does not restart on every tick.
  const latest = useRef({ lines, done, onFound });
  latest.current = { lines, done, onFound };

  const known = lines.filter((l) => l.thing);
  const waiting = known.filter((l) => !done.has(l.id));

  const release = useCallback(() => {
    run.current++;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setStatus("off");
    setOpen(false);
    setNote(null);
  }, [release]);

  useEffect(() => release, [release]);

  const loop = useCallback(
    async (id: number, model: ObjectDetector) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      let state: ScanState = {};
      let lastTs = 0;
      setStatus("on");
      while (run.current === id) {
        await new Promise((r) => setTimeout(r, 1000 / FPS));
        if (run.current !== id || video.readyState < 2 || !video.videoWidth) continue;
        const now = performance.now();
        const ts = Math.max(lastTs + 1, Math.round(now));
        lastTs = ts;
        const res = model.detectForVideo(video, ts);
        const { lines: ls, done: dn, onFound: found } = latest.current;

        const boxes = res.detections.flatMap((d) => {
          const cat = d.categories[0];
          const box = d.boundingBox;
          return cat && box && KNOWN.has(cat.categoryName) && cat.score >= SCAN_MIN_SCORE ? [{ cat, box }] : [];
        });
        const seen = new Set(boxes.map((b) => b.cat.categoryName as ScanThing));
        const step = scanStep(state, seen, now);
        state = step.state;

        // Boxes around the school things in the picture, mirrored like the picture itself.
        const w = video.videoWidth, h = video.videoHeight;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const g = canvas.getContext("2d");
        if (g) {
          g.clearRect(0, 0, w, h);
          g.lineWidth = Math.max(3, w / 160);
          g.font = `600 ${Math.round(w / 26)}px system-ui, sans-serif`;
          for (const b of boxes) {
            const thing = b.cat.categoryName as ScanThing;
            const wanted = !!lineForThing(ls, dn, thing);
            const x = w - b.box.originX - b.box.width;
            g.strokeStyle = wanted ? "#2f9e6e" : "rgba(255,255,255,0.75)";
            g.strokeRect(x, b.box.originY, b.box.width, b.box.height);
            const label = t(`scan.thing.${thing}`);
            const tw = g.measureText(label).width + 16;
            const lh = Math.round(w / 26) + 12;
            g.fillStyle = wanted ? "#2f9e6e" : "rgba(0,0,0,0.55)";
            g.fillRect(x, Math.max(0, b.box.originY - lh), tw, lh);
            g.fillStyle = "#fff";
            g.fillText(label, x + 8, Math.max(0, b.box.originY - lh) + lh - 10);
          }
        }

        for (const thing of step.shown) {
          const line = lineForThing(ls, dn, thing);
          if (line) {
            found(line.id);
            chime(audio.current);
            setNote({ text: t("scan.found", { title: line.title }), good: true });
          } else {
            const had = ls.find((l) => l.thing === thing);
            if (had) setNote({ text: t("scan.already", { title: had.title }), good: false });
          }
        }
      }
    },
    [t],
  );

  const start = useCallback(async () => {
    setError(null);
    setNote(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {
      audio.current = null; // no sound, the tick still shows
    }
    release();
    const id = run.current;
    setStatus("loading");
    try {
      const [media, model] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false }),
        loadObjectDetector(),
      ]);
      if (run.current !== id) {
        media.getTracks().forEach((tr) => tr.stop());
        return;
      }
      stream.current = media;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = media;
      await video.play().catch(() => undefined);
      void loop(id, model);
    } catch (e) {
      release();
      setStatus("off");
      const name = (e as { name?: string })?.name;
      setError(name === "NotAllowedError" || name === "SecurityError" ? "denied" : name === "NotFoundError" || name === "OverconstrainedError" || name === "NotReadableError" ? "nocamera" : "load");
    }
  }, [loop, release]);

  // Everything the robot can find is found: the camera goes off by itself a moment later.
  const allFound = status === "on" && known.length > 0 && waiting.length === 0;
  useEffect(() => {
    if (!allFound) return;
    const timer = setTimeout(() => {
      release();
      setStatus("off");
    }, 2500);
    return () => clearTimeout(timer);
  }, [allFound, release]);

  if (!known.length) return null;
  const list = (ls: ScanLine[]) => ls.map((l) => l.title).join(", ");

  return (
    <div className="scan">
      {!open && status === "off" && (
        <button type="button" className="btn" onClick={() => setOpen(true)} disabled={!waiting.length}>
          {t("scan.button")}
        </button>
      )}

      {(open || status !== "off") && (
        <section className="scan-panel" aria-labelledby="scan-title">
          <h3 id="scan-title">{t("scan.title")}</h3>
          {status === "off" && !allFound && (
            <>
              {error ? (
                <p role="alert">{t(`scan.err.${error}`)}</p>
              ) : (
                <>
                  <p>{t("scan.lead")}</p>
                  <p className="muted small">{t("scan.knows", { list: list(known) })} {known.length < lines.length && t("scan.rest")}</p>
                  <p className="muted small">{t("scan.private")}</p>
                </>
              )}
              <div className="row">
                {waiting.length > 0 && <button type="button" className="btn primary" onClick={start}>{t(error ? "scan.retry" : "scan.start")}</button>}
                <button type="button" className="btn quiet" onClick={stop}>{t("scan.later")}</button>
              </div>
            </>
          )}
          {status === "loading" && <p role="status">{t("scan.loading")}</p>}
          <div className={`scan-view${status === "on" ? " on" : ""}`} hidden={status === "off"}>
            <video ref={videoRef} playsInline muted aria-hidden="true" />
            <canvas ref={canvasRef} aria-hidden="true" />
          </div>
          {status === "on" && (
            <>
              <p className={`scan-note${note?.good ? " good" : ""}`} role="status" aria-live="polite">
                {allFound ? t("scan.allFound") : note ? note.text : t("scan.looking", { list: list(waiting) })}
              </p>
              {!allFound && <p className="muted small">{t("scan.hint")}</p>}
              <div className="row">
                <button type="button" className="btn primary" onClick={stop}>{t("scan.close")}</button>
              </div>
            </>
          )}
          {status === "off" && allFound && <p role="status">{t("scan.allFound")}</p>}
        </section>
      )}
    </div>
  );
}
