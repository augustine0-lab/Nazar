"use client";

// The MediaPipe runtime and models, served by Nazar itself from /vision (see scripts/vision-assets.mjs),
// so camera frames are looked at in the browser and no request goes to another site.
import type { FaceLandmarker, FilesetResolver, ObjectDetector } from "@mediapipe/tasks-vision";

type WasmFileset = Awaited<ReturnType<typeof FilesetResolver.forVisionTasks>>;

export const VISION_BASE = "/vision";

let fileset: Promise<WasmFileset> | null = null;
function files(): Promise<WasmFileset> {
  fileset ??= import("@mediapipe/tasks-vision")
    .then(({ FilesetResolver }) => FilesetResolver.forVisionTasks(`${VISION_BASE}/wasm`))
    .catch((e) => {
      fileset = null;
      throw e;
    });
  return fileset;
}

type Delegate = "GPU" | "CPU";

/** Loads once per page and keeps it; a failed load is tried again next time. If the first delegate refuses, the other one is tried. */
function cached<T>(first: Delegate, make: (delegate: Delegate) => Promise<T>) {
  let p: Promise<T> | null = null;
  return () => {
    p ??= make(first)
      .catch(() => make(first === "GPU" ? "CPU" : "GPU"))
      .catch((e) => {
        p = null;
        throw e;
      });
    return p;
  };
}

export const loadFaceLandmarker = cached<FaceLandmarker>("GPU", async (delegate) => {
  const { FaceLandmarker } = await import("@mediapipe/tasks-vision");
  return FaceLandmarker.createFromOptions(await files(), {
    baseOptions: { modelAssetPath: `${VISION_BASE}/face_landmarker.task`, delegate },
    runningMode: "VIDEO",
    numFaces: 1,
  });
});

// The object detector stays on the CPU: it is small (about 80 ms a frame on a laptop processor), and on
// software-rendered graphics its GPU path ran but found nothing, which would fail without a word.
export const loadObjectDetector = cached<ObjectDetector>("CPU", async (delegate) => {
  const { ObjectDetector } = await import("@mediapipe/tasks-vision");
  return ObjectDetector.createFromOptions(await files(), {
    baseOptions: { modelAssetPath: `${VISION_BASE}/efficientdet_lite0.tflite`, delegate },
    runningMode: "VIDEO",
    maxResults: 5,
    scoreThreshold: 0.3,
  });
});
