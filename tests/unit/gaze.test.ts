import { describe, expect, it } from "vitest";
import * as D from "@/lib/domain";

/** A face looking straight at the camera, with the head turned by `yaw` degrees and the irises moved by `iris` of an eye's width. */
function face({ yaw = 0, pitch = 0, iris = 0 } = {}): D.FacePoint[] {
  const pts: D.FacePoint[] = Array.from({ length: 478 }, () => ({ x: 0.5, y: 0.5, z: 0 }));
  const set = (i: number, x: number, y: number, z = 0) => (pts[i] = { x, y, z });
  const half = 0.1;
  const tz = Math.tan((yaw * Math.PI) / 180) * half;
  set(234, 0.5 - half, 0.5, -tz);
  set(454, 0.5 + half, 0.5, tz);
  const py = Math.tan((pitch * Math.PI) / 180) * 0.175;
  set(10, 0.5, 0.325, -py);
  set(152, 0.5, 0.675, py);
  for (const [a, b, top, bottom, ir, cx] of [[33, 133, 159, 145, 468, 0.45], [362, 263, 386, 374, 473, 0.55]] as const) {
    set(a, cx - 0.02, 0.45);
    set(b, cx + 0.02, 0.45);
    set(top, cx, 0.44);
    set(bottom, cx, 0.46);
    set(ir, cx + iris * 0.04, 0.45);
  }
  return pts;
}

describe("where the reader looks", () => {
  it("reads a face straight at the camera as zero", () => {
    const g = D.gazeOf(face(), 1)!;
    expect(g.x).toBeCloseTo(0, 5);
    expect(g.y).toBeCloseTo(0, 5);
  });

  it("measures a head turn in degrees", () => {
    expect(D.gazeOf(face({ yaw: 30 }), 1)!.x).toBeCloseTo(30, 3);
    expect(D.gazeOf(face({ yaw: -45 }), 1)!.x).toBeCloseTo(-45, 3);
    expect(D.gazeOf(face({ pitch: 20 }), 1)!.y).toBeCloseTo(20, 3);
  });

  it("adds the eyes turning inside a still head", () => {
    expect(D.gazeOf(face({ iris: 0.25 }), 1)!.x).toBeCloseTo(0.25 * D.EYE_TURN_X, 3);
  });

  it("is not a face without the iris points", () => {
    expect(D.gazeOf(face().slice(0, 468), 1)).toBeNull();
  });

  it("smooths single frames", () => {
    expect(D.smooth(null, { x: 10, y: 0 })).toEqual({ x: 10, y: 0 });
    expect(D.smooth({ x: 0, y: 0 }, { x: 10, y: 10 }, 0.5)).toEqual({ x: 5, y: 5 });
  });
});

describe("calibration and the screen", () => {
  it("takes the reader's own straight look as the centre, ignoring frames without a face", () => {
    const frames = [null, null, ...[3, 4, 5, 4, 3, 50, 4, 5, 4].map((x) => ({ x, y: -2 }))];
    expect(D.calibrate(frames)).toEqual({ x: 4, y: -2 });
  });

  it("asks again when the face was seen too few times", () => {
    expect(D.calibrate([{ x: 0, y: 0 }, null, null])).toBeNull();
  });

  it("counts a look inside the field as the screen, a turn or no face as away", () => {
    const centre = { x: 5, y: -3 };
    expect(D.onScreen({ x: 5 + 20, y: -3 }, centre, "NEAR")).toBe(true);
    expect(D.onScreen({ x: 5 + 30, y: -3 }, centre, "NEAR")).toBe(false);
    expect(D.onScreen({ x: 5, y: -3 - 25 }, centre, "NEAR")).toBe(false);
    expect(D.onScreen(null, centre, "NEAR")).toBe(false);
  });

  it("lets the teacher glance at notes but not turn to the class", () => {
    const centre = { x: 0, y: 0 };
    expect(D.onScreen({ x: 30, y: 0 }, centre, "WIDE")).toBe(true);
    expect(D.onScreen({ x: 60, y: 0 }, centre, "WIDE")).toBe(false);
  });
});

describe("timing", () => {
  const run = (frames: [boolean, number][]) => frames.reduce((s, [seen, t]) => D.gazeStep(s, seen, t), D.GAZE_START);

  it("does not stop the text for a blink", () => {
    expect(run([[true, 0], [false, 100], [false, 400], [true, 500], [true, 1500]]).looking).toBe(true);
  });

  it("stops after looking away long enough", () => {
    expect(run([[true, 0], [false, 100], [false, 100 + D.AWAY_AFTER_MS - 1]]).looking).toBe(true);
    expect(run([[true, 0], [false, 100], [false, 100 + D.AWAY_AFTER_MS]]).looking).toBe(false);
  });

  it("comes back sooner than it goes away, and a flicker restarts the wait", () => {
    const away = run([[false, 0], [false, D.AWAY_AFTER_MS]]);
    expect(away.looking).toBe(false);
    const t0 = D.AWAY_AFTER_MS + 10;
    expect(D.gazeStep(D.gazeStep(away, true, t0), true, t0 + D.BACK_AFTER_MS).looking).toBe(true);
    const flicker = [true, false, true].reduce((s, seen, k) => D.gazeStep(s, seen, t0 + k * 200), away);
    expect(D.gazeStep(flicker, true, t0 + 400 + D.BACK_AFTER_MS - 1).looking).toBe(false);
  });
});

describe("calibration progress", () => {
  it("needs both the time and enough frames with a face", () => {
    expect(D.calibrationShare(D.CALIBRATION_MS, D.CALIBRATION_MIN_FRAMES)).toBe(1);
    expect(D.calibrationShare(D.CALIBRATION_MS * 3, 2)).toBeCloseTo(2 / D.CALIBRATION_MIN_FRAMES);
    expect(D.calibrationShare(D.CALIBRATION_MS / 2, 100)).toBeCloseTo(0.5);
  });
});
