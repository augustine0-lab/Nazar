"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FaceLandmarker } from "@mediapipe/tasks-vision";
import {
  CALIBRATION_MAX_MS,
  GAZE_START,
  calibrationShare,
  calibrate,
  gazeOf,
  gazeStep,
  onScreen,
  smooth,
  type Gaze,
  type GazeField,
  type GazeState,
} from "@/lib/domain/gaze";

export type GazeStatus = "off" | "loading" | "calibrating" | "on";
export type GazeError = "unsupported" | "denied" | "nocamera" | "noface" | "load";

/** Frames per second the face model looks at: enough to notice a turn, light on a school laptop. */
const FPS = 12;
const BASE = "/gaze";

// One model per page, loaded on first use and kept while the page is open.
let landmarker: Promise<FaceLandmarker> | null = null;
function loadLandmarker(): Promise<FaceLandmarker> {
  landmarker ??= (async () => {
    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const files = await FilesetResolver.forVisionTasks(`${BASE}/wasm`);
    const make = (delegate: "GPU" | "CPU") =>
      FaceLandmarker.createFromOptions(files, {
        baseOptions: { modelAssetPath: `${BASE}/face_landmarker.task`, delegate },
        runningMode: "VIDEO",
        numFaces: 1,
      });
    return make("GPU").catch(() => make("CPU"));
  })().catch((e) => {
    landmarker = null;
    throw e;
  });
  return landmarker;
}

/**
 * The camera and the on-device face model, for one page. `start` asks for the camera, loads the model,
 * and calibrates while the reader looks at a dot; then `looking` follows the reader's gaze. Frames go
 * from the camera to the model in this tab and nowhere else; nothing is recorded, counted or saved.
 */
export function useGaze(field: GazeField) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [status, setStatus] = useState<GazeStatus>("off");
  const [error, setError] = useState<GazeError | null>(null);
  const [looking, setLooking] = useState(true);
  const [progress, setProgress] = useState(0);
  const run = useRef(0); // bumps on every start/stop, so a stale loop stops itself
  const stream = useRef<MediaStream | null>(null);

  const release = useCallback(() => {
    run.current++;
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const stop = useCallback(() => {
    release();
    setStatus("off");
    setLooking(true);
    setProgress(0);
  }, [release]);

  const loop = useCallback(
    async (id: number, model: FaceLandmarker) => {
      const video = videoRef.current;
      if (!video) return;
      let current: Gaze | null = null;
      let state: GazeState = GAZE_START;
      let centre: Gaze | null = null;
      const frames: (Gaze | null)[] = [];
      const began = performance.now();
      let lastTs = 0;
      setStatus("calibrating");
      setProgress(0);

      while (run.current === id) {
        await new Promise((r) => setTimeout(r, 1000 / FPS));
        if (run.current !== id) return;
        const now = performance.now();
        let g: Gaze | null = null;
        if (video.readyState >= 2 && video.videoWidth > 0) {
          const ts = Math.max(lastTs + 1, Math.round(now));
          lastTs = ts;
          const res = model.detectForVideo(video, ts);
          const pts = res.faceLandmarks[0];
          g = pts ? gazeOf(pts, video.videoWidth / video.videoHeight) : null;
        }

        if (!centre) {
          // Calibration: the reader looks at the dot; their own "straight at the screen" is the middle of it.
          frames.push(g);
          const share = calibrationShare(now - began, frames.filter(Boolean).length);
          setProgress(share);
          if (share < 1 && now - began < CALIBRATION_MAX_MS) continue;
          centre = calibrate(frames);
          if (!centre) {
            release();
            setError("noface");
            setStatus("off");
            return;
          }
          setStatus("on");
          continue;
        }

        current = g ? smooth(current, g) : null;
        // A hidden tab is not being read either.
        const seen = !document.hidden && onScreen(current, centre, field);
        const next = gazeStep(state, seen, now);
        if (next.looking !== state.looking) setLooking(next.looking);
        state = next;
      }
    },
    [field, release],
  );

  const start = useCallback(async () => {
    setError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError("unsupported");
      return;
    }
    release();
    const id = run.current;
    setStatus("loading");
    setLooking(true);
    try {
      const [media, model] = await Promise.all([
        navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }, audio: false }),
        loadLandmarker(),
      ]);
      if (run.current !== id) {
        media.getTracks().forEach((t) => t.stop());
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

  // The camera goes off with the page.
  useEffect(() => release, [release]);

  return { videoRef, status, error, looking: status !== "on" || looking, progress, start, stop };
}

export type GazeApi = ReturnType<typeof useGaze>;
