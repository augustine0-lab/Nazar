// Copies the MediaPipe WebAssembly runtime (face model and object detector) from node_modules into public/vision/wasm, so that the
// browser loads it from Nazar itself and no camera-related request goes to any other site.
// Runs before `next dev` and `next build`. The model files in public/vision are committed.
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules/@mediapipe/tasks-vision/wasm");
const to = join(root, "public/vision/wasm");
mkdirSync(to, { recursive: true });
for (const name of ["vision_wasm_internal", "vision_wasm_nosimd_internal"])
  for (const ext of [".js", ".wasm"]) copyFileSync(join(from, name + ext), join(to, name + ext));
console.log("vision: runtime copied to public/vision/wasm");
