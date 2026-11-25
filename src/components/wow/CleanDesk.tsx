"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ObjectDetector } from "@mediapipe/tasks-vision";
import { DESK_DISTRACTORS, DESK_GOOD, SCAN_MIN_SCORE, deskStart, deskStep, type DeskState, type DeskThing } from "@/lib/domain";
import { useI18n } from "@/lib/i18n/client";
import { loadObjectDetector } from "../vision";

type Status = "off" | "loading" | "on" | "clear";
type DeskError = "unsupported" | "denied" | "nocamera" | "load";

const FPS = 8;
const BAD = new Set<string>(Object.keys(DESK_DISTRACTORS));
const GOOD = new Set<string>(DESK_GOOD);

function chime(ctx: AudioContext | null) {
  if (!ctx) return;
  const t0 = ctx.currentTime;
  [523, 659, 784].forEach((f, k) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = f;
    const t = t0 + k * 0.11;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + 0.37);
  });
}

/**
 * «Чистый стол»: before homework the child shows the desk to the camera. Things that pull away (a phone,
 * a toy, food) get a red frame; when the desk has stayed clear for two seconds, `onClear` starts the timer.
 * A ritual, not a check: the frames stay in this tab, nothing is recorded or sent.
 */
export function CleanDesk({ onClear }: { onClear: () => void }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>("off");
  const [error, setError] = useState<DeskError | null>(null);
  const [onDesk, setOnDesk] = useState<DeskThing[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const run = useRef(0);
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<AudioContext | null>(null);
  const mirror = useRef(true);
  const clearRef = useRef(onClear);
  clearRef.current = onClear;

  const release = useCallback(() => {
    run.current++;
    stream.current?.getTracks().forEach((tr) => tr.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);
  useEffect(() => release, [release]);

  const close = useCallback(() => {
    release();
    setStatus("off");
    setOpen(false);
    setOnDesk([]);
  }, [release]);

  const loop = useCallback(
    async (id: number, model: ObjectDetector) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas) return;
      let state: DeskState = deskStart(performance.now());
      let lastTs = 0;
      setStatus("on");
      while (run.current === id) {
        await new Promise((r) => setTimeout(r, 1000 / FPS));
        if (run.current !== id || video.readyState < 2 || !video.videoWidth) continue;
        const now = performance.now();
        const ts = Math.max(lastTs + 1, Math.round(now));
        lastTs = ts;
        const res = model.detectForVideo(video, ts);
        const boxes = res.detections.flatMap((d) => {
          const cat = d.categories[0];
          const box = d.boundingBox;
          return cat && box && cat.score >= SCAN_MIN_SCORE && (BAD.has(cat.categoryName) || GOOD.has(cat.categoryName)) ? [{ name: cat.categoryName, box }] : [];
        });
        const step = deskStep(state, new Set(boxes.map((b) => b.name)), now);
        state = step.state;
        setOnDesk(step.onDesk);

        const w = video.videoWidth, h = video.videoHeight;
        if (canvas.width !== w) canvas.width = w;
        if (canvas.height !== h) canvas.height = h;
        const g = canvas.getContext("2d");
        if (g) {
          g.clearRect(0, 0, w, h);
          g.lineWidth = Math.max(3, w / 140);
          g.font = `700 ${Math.round(w / 24)}px system-ui, sans-serif`;
          for (const b of boxes) {
            const bad = BAD.has(b.name);
            const x = mirror.current ? w - b.box.originX - b.box.width : b.box.originX;
            g.strokeStyle = bad ? "#e0525a" : "#2f9e6e";
            g.strokeRect(x, b.box.originY, b.box.width, b.box.height);
            const label = bad ? t("desk.away", { thing: t(`desk.thing.${b.name}` as "desk.thing.remote") }) : t("desk.ok");
            const lh = Math.round(w / 24) + 12;
            const tw = g.measureText(label).width + 16;
            const y = Math.max(0, b.box.originY - lh);
            g.fillStyle = bad ? "#e0525a" : "#2f9e6e";
            g.fillRect(x, y, tw, lh);
            g.fillStyle = "#fff";
            g.fillText(label, x + 8, y + lh - 10);
          }
        }

        if (step.clear) {
          chime(audio.current);
          setStatus("clear");
          release();
          setTimeout(() => clearRef.current(), 900);
          return;
        }
      }
    },
    [release, t],
  );

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }
    try {
      audio.current ??= new AudioContext();
      void audio.current.resume();
    } catch {
      audio.current = null;
    }
    release();
    const id = run.current;
    setStatus("loading");
    try {
      const [media, model] = await Promise.all([
        // On a phone the back camera looks at the desk; a laptop has only the front one.
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: { ideal: "environment" } }, audio: false }),
        loadObjectDetector(),
      ]);
      if (run.current !== id) {
        media.getTracks().forEach((tr) => tr.stop());
        return;
      }
      stream.current = media;
      mirror.current = media.getVideoTracks()[0]?.getSettings().facingMode !== "environment";
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

  if (!open)
    return (
      <button type="button" className="btn" onClick={() => setOpen(true)}>
        <span aria-hidden="true">🧹</span> {t("desk.open")}
      </button>
    );

  return (
    <section className="scan-panel desk" aria-labelledby="desk-title">
      <h3 id="desk-title"><span aria-hidden="true">🧹</span> {t("desk.title")}</h3>
      {status === "off" && (
        <>
          {error ? <p role="alert">{t(`scan.err.${error}`)}</p> : <p>{t("desk.lead")}</p>}
          <p className="muted small">{t("desk.private")}</p>
          <div className="row">
            <button type="button" className="btn primary" onClick={start}>{t(error ? "scan.retry" : "scan.start")}</button>
            <button type="button" className="btn quiet" onClick={close}>{t("scan.later")}</button>
          </div>
        </>
      )}
      {status === "loading" && <p role="status">{t("scan.loading")}</p>}
      <div className={`scan-view${status === "on" ? " on" : ""}${mirror.current ? "" : " plain"}`} hidden={status !== "on" && status !== "loading"}>
        <video ref={videoRef} playsInline muted aria-hidden="true" />
        <canvas ref={canvasRef} aria-hidden="true" />
      </div>
      {status === "on" && (
        <>
          <p className={`scan-note${onDesk.length ? "" : " good"}`} role="status" aria-live="polite">
            {onDesk.length
              ? t("desk.found", { list: onDesk.map((d) => `${DESK_DISTRACTORS[d]} ${t(`desk.thing.${d}` as "desk.thing.remote")}`).join(", ") })
              : t("desk.looking")}
          </p>
          <div className="row">
            <button type="button" className="btn quiet" onClick={close}>{t("scan.close")}</button>
          </div>
        </>
      )}
      {status === "clear" && <p className="scan-note good" role="status">{t("desk.clear")}</p>}
    </section>
  );
}
