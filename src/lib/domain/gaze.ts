// «Взгляд Nazar»: is the reader looking at the screen? Pure geometry and timing, no camera or browser here.
// The browser part (src/components/gaze) turns camera frames into face points with an on-device model and
// feeds them to these rules. Nothing is stored or sent anywhere: the answer lives only in the open page.

/** A face point as the face model gives it: x and z in image widths, y in image heights. */
export interface FacePoint {
  x: number;
  y: number;
  z: number;
}

/** Where the reader looks, in rough degrees: head turn plus how far the eyes are turned inside it. */
export interface Gaze {
  x: number;
  y: number;
}

// Point numbers in the face model's 478-point mesh (468 face points, then 10 iris points).
const P = {
  cheekR: 234, // the reader's right cheek edge, on the left of the image
  cheekL: 454,
  brow: 10, // top of the forehead
  chin: 152,
  eyeR: { a: 33, b: 133, top: 159, bottom: 145, iris: 468 },
  eyeL: { a: 362, b: 263, top: 386, bottom: 374, iris: 473 },
} as const;

/** Degrees the eye turns when the iris moves from the middle of the eye to its corner (roughly). */
export const EYE_TURN_X = 60;
export const EYE_TURN_Y = 40;

const deg = (rad: number) => (rad * 180) / Math.PI;

/**
 * Head turn and tilt from the 3D face points, plus the iris position inside each eye. `aspect` is the
 * camera's width / height, so that x, y and z are measured in the same units. Returns null when the
 * points are not a whole face.
 */
export function gazeOf(points: readonly FacePoint[], aspect: number): Gaze | null {
  if (points.length < 474) return null;
  const at = (i: number) => {
    const p = points[i];
    return { x: p.x * aspect, y: p.y, z: p.z * aspect };
  };
  const cr = at(P.cheekR), cl = at(P.cheekL), brow = at(P.brow), chin = at(P.chin);
  // Turning the head moves one cheek towards the camera: the angle of the cheek-to-cheek line in depth.
  const yaw = deg(Math.atan2(cl.z - cr.z, cl.x - cr.x));
  const pitch = deg(Math.atan2(chin.z - brow.z, chin.y - brow.y));

  const eye = (e: { a: number; b: number; top: number; bottom: number; iris: number }) => {
    const a = at(e.a), b = at(e.b), top = at(e.top), bottom = at(e.bottom), iris = at(e.iris);
    const left = Math.min(a.x, b.x), right = Math.max(a.x, b.x);
    const w = right - left, h = bottom.y - top.y;
    return {
      x: w > 0 ? (iris.x - left) / w - 0.5 : 0,
      y: h > 0 ? (iris.y - top.y) / h - 0.5 : 0,
    };
  };
  const r = eye(P.eyeR), l = eye(P.eyeL);
  return {
    x: yaw + ((r.x + l.x) / 2) * EYE_TURN_X,
    y: pitch + ((r.y + l.y) / 2) * EYE_TURN_Y,
  };
}

/** Smooths the jitter of single frames: each new frame moves the estimate this share of the way. */
export const GAZE_SMOOTHING = 0.35;

export function smooth(prev: Gaze | null, next: Gaze, k = GAZE_SMOOTHING): Gaze {
  if (!prev) return next;
  return { x: prev.x + (next.x - prev.x) * k, y: prev.y + (next.y - prev.y) * k };
}

/* ---------- calibration ---------- */

/** The reader looks at a dot in the middle of the screen for this long; that is "looking at the screen". */
export const CALIBRATION_MS = 2500;
/** Calibration needs at least this many frames with a face; a slow laptop simply takes a little longer. */
export const CALIBRATION_MIN_FRAMES = 8;
/** No face in enough frames by then, and we ask to sit facing the camera. */
export const CALIBRATION_MAX_MS = 9000;

/** How far calibration has got (0..1): both the time and the frames with a face must be there. */
export function calibrationShare(elapsedMs: number, faceFrames: number): number {
  return Math.min(1, elapsedMs / CALIBRATION_MS, faceFrames / CALIBRATION_MIN_FRAMES);
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** The reader's own "straight at the screen", from the frames taken while they looked at the dot. */
export function calibrate(frames: readonly (Gaze | null)[]): Gaze | null {
  const seen = frames.filter((g): g is Gaze => g !== null);
  if (seen.length < CALIBRATION_MIN_FRAMES) return null;
  return { x: median(seen.map((g) => g.x)), y: median(seen.map((g) => g.y)) };
}

/* ---------- on the screen or not ---------- */

/**
 * How far from the calibrated centre still counts as the screen, in degrees. NEAR is a pupil at a laptop
 * or tablet: the screen is close, so its edges are not far off. WIDE is the teacher at the projector:
 * only a real turn away (to the class) counts, glances at the notes do not.
 */
export const GAZE_FIELD = {
  NEAR: { x: 22, y: 18 },
  WIDE: { x: 35, y: 28 },
} as const;
export type GazeField = keyof typeof GAZE_FIELD;

export function onScreen(g: Gaze | null, centre: Gaze, field: GazeField = "NEAR"): boolean {
  if (!g) return false; // no face in the frame: the reader has turned away or left
  const f = GAZE_FIELD[field];
  return Math.abs(g.x - centre.x) <= f.x && Math.abs(g.y - centre.y) <= f.y;
}

/* ---------- timing: a blink is not looking away ---------- */

/** Looking away must last this long before the text stops: a blink or a glance at the pen does not count. */
export const AWAY_AFTER_MS = 900;
/** Looking back must last this long before the text comes back, so a passing glance does not restart it. */
export const BACK_AFTER_MS = 300;

export interface GazeState {
  looking: boolean;
  /** When the current frames started to disagree with `looking`, or null while they agree. */
  changingSince: number | null;
}

export const GAZE_START: GazeState = { looking: true, changingSince: null };

/** One frame at time `t` (ms): flips `looking` only after the frames have disagreed long enough. */
export function gazeStep(s: GazeState, seen: boolean, t: number): GazeState {
  if (seen === s.looking) return s.changingSince === null ? s : { looking: s.looking, changingSince: null };
  if (s.changingSince === null) return { looking: s.looking, changingSince: t };
  const wait = s.looking ? AWAY_AFTER_MS : BACK_AFTER_MS;
  return t - s.changingSince >= wait ? { looking: seen, changingSince: null } : s;
}
