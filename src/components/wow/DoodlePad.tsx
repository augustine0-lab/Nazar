"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

const W = 480, H = 360;
const INK = "#6a5cf0";
const BRUSH = 7;

export const doodleKey = (readingId: string, chapter: number) => `nazar.doodle.${readingId}.${chapter}`;

function readDoodle(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

/** Dots of a «қошқар мүйіз» (ram's horn) ornament to trace, faint under the drawing. */
function ornamentDots(): [number, number][] {
  const out: [number, number][] = [];
  for (const side of [-1, 1]) {
    for (let k = 0; k <= 26; k++) {
      const a = (k / 26) * Math.PI * 2.6;
      const r = 120 - k * 3.6;
      out.push([W / 2 + side * (70 + r * Math.cos(a) * 0.62), H / 2 - 10 + r * Math.sin(a) * 0.62]);
    }
  }
  for (let k = 0; k <= 8; k++) out.push([W / 2, H / 2 + 40 + k * 12]);
  return out;
}

/**
 * «Каракули для внимания»: while the text is read aloud, the child may draw with a finger — hands busy,
 * ears listening. One brush, one colour, no eraser, so drawing does not become the task. Each chapter's
 * drawing stays in this browser only.
 */
export function DoodlePad({ storeKey }: { storeKey: string }) {
  const { t } = useI18n();
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const last = useRef<[number, number] | null>(null);
  const [empty, setEmpty] = useState(true);
  const dots = useMemo(ornamentDots, []);

  useEffect(() => {
    const c = ref.current;
    const g = c?.getContext("2d");
    if (!c || !g) return;
    g.clearRect(0, 0, W, H);
    const saved = readDoodle(storeKey);
    setEmpty(!saved);
    if (saved) {
      const img = new Image();
      img.onload = () => g.drawImage(img, 0, 0, W, H);
      img.src = saved;
    }
  }, [storeKey]);

  const at = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H];
  };
  const line = (from: [number, number], to: [number, number]) => {
    const g = ref.current?.getContext("2d");
    if (!g) return;
    g.strokeStyle = INK;
    g.fillStyle = INK;
    g.lineWidth = BRUSH;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.beginPath();
    g.moveTo(from[0], from[1]);
    g.lineTo(to[0], to[1]);
    g.stroke();
  };
  const save = () => {
    try {
      localStorage.setItem(storeKey, ref.current!.toDataURL("image/png"));
    } catch {
      /* full or private storage: the drawing just is not kept */
    }
  };

  return (
    <div className="doodle">
      <div className="doodle-sheet">
        <svg viewBox={`0 0 ${W} ${H}`} aria-hidden="true">
          {dots.map(([x, y], k) => <circle key={k} cx={x} cy={y} r="2.4" />)}
        </svg>
        <canvas
          ref={ref}
          width={W}
          height={H}
          aria-label={t("dd.aria")}
          role="img"
          onPointerDown={(e) => {
            e.currentTarget.setPointerCapture?.(e.pointerId);
            drawing.current = true;
            const p = at(e);
            last.current = p;
            line(p, [p[0] + 0.1, p[1] + 0.1]);
            setEmpty(false);
          }}
          onPointerMove={(e) => {
            if (!drawing.current || !last.current) return;
            const p = at(e);
            line(last.current, p);
            last.current = p;
          }}
          onPointerUp={() => {
            if (!drawing.current) return;
            drawing.current = false;
            last.current = null;
            save();
          }}
          onPointerCancel={() => { drawing.current = false; last.current = null; }}
        />
      </div>
      <div className="row between">
        <span className="muted small">{t("dd.hint")}</span>
        <button
          type="button"
          className="btn quiet"
          disabled={empty}
          onClick={() => {
            ref.current?.getContext("2d")?.clearRect(0, 0, W, H);
            try {
              localStorage.removeItem(storeKey);
            } catch {
              /* nothing kept anyway */
            }
            setEmpty(true);
          }}
        >
          {t("dd.clear")}
        </button>
      </div>
    </div>
  );
}

/** At the end of the text: the drawings made while listening, one per chapter. */
export function DoodleGallery({ readingId, chapters }: { readingId: string; chapters: string[] }) {
  const { t } = useI18n();
  const [pics, setPics] = useState<{ k: number; src: string }[]>([]);
  const count = chapters.length;
  useEffect(() => {
    const out: { k: number; src: string }[] = [];
    for (let k = 0; k < count; k++) {
      const src = readDoodle(doodleKey(readingId, k));
      if (src) out.push({ k, src });
    }
    setPics(out);
  }, [readingId, count]);
  if (!pics.length) return null;
  return (
    <section className="doodle-gallery" aria-label={t("dd.gallery")}>
      <h3>{t("dd.gallery")}</h3>
      <p className="muted small">{t("dd.galleryLead")}</p>
      <ul>
        {pics.map((p) => (
          <li key={p.k}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.src} alt={t("dd.picAlt", { name: chapters[p.k] })} />
            <span className="small">{chapters[p.k]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
