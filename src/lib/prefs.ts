// View settings kept in one cookie on the device (no account needed, works on the login screen too).
export const PREFS_COOKIE = "nazar_prefs";

export interface Prefs {
  /** Text size step: 0 normal, 1 large, 2 very large */
  fs: 0 | 1 | 2;
  /** Reading mode: wider spacing and a plain typeface */
  rd: boolean;
  th: "auto" | "light" | "dark";
  /** Calm mode: no animation, muted colours */
  cm: boolean;
}

export const DEFAULT_PREFS: Prefs = { fs: 0, rd: false, th: "auto", cm: false };

export function parsePrefs(raw: string | null | undefined): Prefs {
  const p = { ...DEFAULT_PREFS };
  for (const part of (raw ?? "").split("&")) {
    const [k, v] = part.split("=");
    if (k === "fs" && (v === "1" || v === "2")) p.fs = Number(v) as 1 | 2;
    else if (k === "rd") p.rd = v === "1";
    else if (k === "th" && (v === "light" || v === "dark")) p.th = v;
    else if (k === "cm") p.cm = v === "1";
  }
  return p;
}

export const serializePrefs = (p: Prefs) => `fs=${p.fs}&rd=${p.rd ? 1 : 0}&th=${p.th}&cm=${p.cm ? 1 : 0}`;

/** Attributes for <html>; the stylesheet reacts to them. */
export const prefsAttributes = (p: Prefs) => ({
  "data-fs": String(p.fs),
  "data-read": p.rd ? "1" : "0",
  "data-theme": p.th,
  "data-calm": p.cm ? "1" : "0",
});
