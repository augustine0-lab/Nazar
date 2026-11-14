// Copies the face model's WebAssembly runtime from node_modules into public/gaze/wasm, so that the
// browser loads it from Nazar itself and no camera-related request goes to any other site.
// Runs before `next dev` and `next build`. The model file public/gaze/face_landmarker.task is committed.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const to = join(root, "public/gaze/wasm");
mkdirSync(to, { recursive: true });
for (const name of ["vision_wasm_internal", "vision_wasm_nosimd_internal"])
  for (const ext of [".js", ".wasm"]) copyFileSync(join(from, name + ext), join(to, name + ext));
console.log("gaze: runtime copied to public/gaze/wasm");
