import type { Scene } from "@/lib/domain";

// Painted landscapes for the chapters of a living text. Drawn in code, so nothing is downloaded and every
// picture works offline. Soft colours, slow movement; the movement stops in the calm view and with reduced motion.

const W = 1600;
const H = 700;

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Points of a gentle ridge line across the picture. */
function ridgePoints(seed: number, base: number, amp: number, waves = 3, step = 40): [number, number][] {
  const r = rng(seed);
  const parts = Array.from({ length: waves }, (_, i) => ({ f: (i + 1) * (0.6 + r()) * 0.004, p: r() * 6.28, a: amp / (i + 1.2) }));
  const pts: [number, number][] = [];
  for (let x = -step; x <= W + step; x += step) pts.push([x, base - parts.reduce((y, w) => y + Math.sin(x * w.f + w.p) * w.a, 0)]);
  return pts;
}

/** A smooth closed shape from a ridge down to the bottom edge (Catmull-Rom through the points). */
function ridge(pts: [number, number][], bottom = H + 10) {
  let d = `M${pts[0][0]},${bottom} L${pts[0][0]},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0]},${p2[1].toFixed(1)}`;
  }
  return `${d} L${pts[pts.length - 1][0]},${bottom} Z`;
}

/** Smooth curve through points, continuing an open path. */
function through(pts: number[][]) {
  let d = "";
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

/** A river that widens from the horizon to the front. */
function riverPath() {
  const left = [[798, 400], [772, 440], [812, 492], [690, 556], [560, 624], [360, 720]];
  const right = [[806, 400], [796, 440], [884, 492], [826, 556], [770, 624], [1000, 720]];
  return `M${left[0][0]},${left[0][1]}${through(left)} L${right[right.length - 1][0]},${right[right.length - 1][1]}${through([...right].reverse())} Z`;
}

const hills = (seed: number, base: number, amp: number, fill: string, waves = 3) => (
  <path d={ridge(ridgePoints(seed, base, amp, waves))} fill={fill} />
);

/** Sharp mountain range: peaks at random places, optional snow caps. */
function peaks(seed: number, base: number, height: number, n: number, fill: string, snow?: string) {
  const r = rng(seed);
  const tops = Array.from({ length: n }, (_, i) => ({ x: ((i + 0.2 + r() * 0.6) / n) * W, h: height * (0.55 + r() * 0.45) }));
  let d = `M-20,${H + 10} L-20,${base}`;
  const caps: string[] = [];
  tops.forEach((t, i) => {
    const prevX = i ? (tops[i - 1].x + t.x) / 2 : -20;
    const valley = base - height * 0.15 * r();
    d += ` L${prevX.toFixed(0)},${valley.toFixed(0)} L${t.x.toFixed(0)},${(base - t.h).toFixed(0)}`;
    const k = 0.22;
    const y = base - t.h;
    caps.push(`M${(t.x - t.h * 0.5 * k).toFixed(0)},${(y + t.h * k * 0.9).toFixed(0)} L${t.x.toFixed(0)},${y.toFixed(0)} L${(t.x + t.h * 0.55 * k).toFixed(0)},${(y + t.h * k).toFixed(0)} L${(t.x + t.h * 0.1 * k).toFixed(0)},${(y + t.h * k * 0.7).toFixed(0)} Z`);
  });
  d += ` L${W + 20},${base} L${W + 20},${H + 10} Z`;
  return (
    <g>
      <path d={d} fill={fill} />
      {snow && caps.map((c, i) => <path key={i} d={c} fill={snow} />)}
    </g>
  );
}

/** A row of fir trees standing on a ridge. */
function pines(seed: number, base: number, size: number, n: number, fill: string, snow?: string) {
  const r = rng(seed);
  return (
    <g fill={fill}>
      {Array.from({ length: n }, (_, i) => {
        const x = (i / n) * (W + 80) - 40 + r() * 30;
        const h = size * (0.6 + r() * 0.6);
        const y = base + r() * 20;
        const w = h * 0.36;
        return (
          <g key={i}>
            <path d={`M${x},${y - h} L${x - w},${y} L${x + w},${y} Z M${x},${y - h * 1.15} L${x - w * 0.7},${y - h * 0.45} L${x + w * 0.7},${y - h * 0.45} Z`} />
            {snow && <path d={`M${x},${y - h * 1.15} L${x - w * 0.35},${y - h * 0.8} L${x + w * 0.35},${y - h * 0.8} Z`} fill={snow} />}
          </g>
        );
      })}
    </g>
  );
}

function cloud(x: number, y: number, s: number, fill: string, cls = "sc-drift", dur = 90) {
  return (
    <g className={cls} style={{ animationDuration: `${dur}s` }}>
      <g transform={`translate(${x} ${y}) scale(${s})`} fill={fill}>
        <ellipse cx="0" cy="0" rx="90" ry="34" />
        <ellipse cx="-50" cy="6" rx="60" ry="26" />
        <ellipse cx="55" cy="4" rx="70" ry="28" />
        <ellipse cx="10" cy="-22" rx="55" ry="34" />
      </g>
    </g>
  );
}

const birds = (x: number, y: number, fill: string) => (
  <g className="sc-drift" style={{ animationDuration: "70s" }} fill="none" stroke={fill} strokeWidth="3" strokeLinecap="round">
    <path d={`M${x},${y} q10,-10 20,0 q10,-10 20,0`} />
    <path d={`M${x + 60},${y - 26} q8,-8 16,0 q8,-8 16,0`} />
    <path d={`M${x + 30},${y + 22} q7,-7 14,0 q7,-7 14,0`} />
  </g>
);

function sky(id: string, stops: string[]) {
  return (
    <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
      {stops.map((c, i) => <stop key={i} offset={i / (stops.length - 1)} stopColor={c} />)}
    </linearGradient>
  );
}

function sun(id: string, x: number, y: number, r: number, core: string, glow: string, cls = "sc-rise") {
  return (
    <g className={cls}>
      <circle cx={x} cy={y} r={r * 4} fill={`url(#${id}-glow)`} />
      <circle cx={x} cy={y} r={r} fill={core} />
      <radialGradient id={`${id}-glow`}>
        <stop offset="0" stopColor={glow} stopOpacity="0.75" />
        <stop offset="1" stopColor={glow} stopOpacity="0" />
      </radialGradient>
    </g>
  );
}

type Painter = (id: string) => { sky: string[]; body: React.ReactNode };

const PAINT: Record<Scene, Painter> = {
  sea: (id) => ({
    sky: ["#b98ab8", "#ef8c86", "#f7c99a", "#fbe6c4"],
    body: (
      <>
        {sun(id, 520, 470, 70, "#fff1d6", "#ffd9a0")}
        {cloud(1150, 150, 1.2, "#f7b9a8", "sc-drift", 120)}
        {cloud(300, 120, 0.8, "#f3c2b8", "sc-drift", 150)}
        <path d={`M1000,${H} L1000,470 C1100,430 1180,380 1260,360 C1330,330 1420,300 1520,250 L1620,230 L1620,${H} Z`} fill="#5fae8b" />
        <path d={`M1180,${H} L1180,480 C1260,440 1340,420 1440,380 C1500,360 1560,330 1620,320 L1620,${H} Z`} fill="#3f9675" />
        <rect x="0" y="480" width={W} height="230" fill={`url(#${id}-water)`} />
        <linearGradient id={`${id}-water`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7fd0c8" />
          <stop offset="1" stopColor="#2f9fae" />
        </linearGradient>
        <g className="sc-shimmer" stroke="#fff4dc" strokeLinecap="round">
          {[[520, 120], [540, 90], [562, 150], [588, 70], [612, 110], [640, 60], [668, 90]].map(([y, w], k) => (
            <path key={k} d={`M${520 - w / 2},${y} h${w}`} strokeWidth={6 - k * 0.5} />
          ))}
        </g>
        {[520, 565, 615, 670].map((y, i) => (
          <path key={y} className="sc-wave" style={{ animationDelay: `${-i * 1.6}s` }} d={ridge(ridgePoints(10 + i, y, 6 + i * 2, 4, 30), y + 40)} fill="none" stroke="#e6fbf6" strokeOpacity={0.45 - i * 0.07} strokeWidth="3" />
        ))}
        <g className="sc-bob">
          <path d="M760,560 L900,560 L880,585 L780,585 Z" fill="#6a4a3a" />
          <path d="M828,556 L828,450 L880,548 Z" fill="#fff6e8" />
          <path d="M822,552 L822,470 L784,548 Z" fill="#f7d7c0" />
        </g>
        {birds(260, 260, "#7b5a78")}
      </>
    ),
  }),
  steppe: (id) => ({
    sky: ["#9fc6e0", "#cfe2e4", "#f7e3bd", "#f6cf98"],
    body: (
      <>
        {sun(id, 1220, 300, 64, "#fff3cf", "#ffd98e")}
        {cloud(400, 140, 1, "#ffffff", "sc-drift", 130)}
        {cloud(1000, 110, 0.7, "#fdf6ea", "sc-drift", 160)}
        {hills(3, 470, 40, "#c9b98a", 2)}
        {hills(4, 520, 30, "#d8b56a", 3)}
        <g transform="translate(980 505)">
          <path d="M-70,0 L-70,-46 Q0,-110 70,-46 L70,0 Z" fill="#fbf4e6" />
          <path d="M-70,-46 Q0,-110 70,-46" fill="none" stroke="#b5835a" strokeWidth="6" />
          <path d="M-16,0 L-16,-34 L16,-34 L16,0 Z" fill="#b25a3c" />
          <path d="M-60,-22 L60,-22" stroke="#b5835a" strokeWidth="4" strokeDasharray="10 8" />
        </g>
        {[[520, 548, 1, false], [640, 556, 0.85, true]].map(([x, y, k, grazing], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${k})`}>
            <g className="sc-graze" style={{ animationDelay: `${-i * 3}s` }} fill="#7a5638" stroke="#7a5638" strokeLinecap="round">
              <ellipse cx="0" cy="0" rx="34" ry="14" stroke="none" />
              {grazing ? (
                <path d="M24,-8 L46,18 L54,22 L50,28 L40,26 L22,4 Z" stroke="none" />
              ) : (
                <path d="M22,-8 L40,-32 L52,-34 L60,-26 L54,-22 L46,-22 L34,0 Z" stroke="none" />
              )}
              <path d="M-24,6 L-27,36 M-13,10 L-11,36 M15,10 L13,36 M25,6 L28,36" strokeWidth="5" fill="none" />
              <path d="M-32,-6 q-16,8 -12,30" strokeWidth="6" fill="none" />
            </g>
          </g>
        ))}
        {hills(5, 600, 24, "#c79a4c", 3)}
        <g className="sc-sway" stroke="#e9cf91" strokeWidth="3" strokeLinecap="round" fill="none">
          {Array.from({ length: 40 }, (_, i) => {
            const x = i * 41 + 10;
            return <path key={i} d={`M${x},700 q8,-40 ${18 + (i % 3) * 6},-${70 + (i % 5) * 10}`} />;
          })}
        </g>
        {hills(6, 670, 14, "#a97c3a", 2)}
        {birds(300, 230, "#6d6a6a")}
      </>
    ),
  }),
  mountains: (id) => ({
    sky: ["#7a9ad6", "#a9c0ea", "#e8d8ea", "#fbe3cf"],
    body: (
      <>
        {sun(id, 300, 220, 46, "#fff6e4", "#ffe2c4")}
        {peaks(21, 520, 360, 5, "#9aa6d6", "#f4f6ff")}
        {cloud(1200, 220, 1.1, "#ffffffcc", "sc-drift", 140)}
        {peaks(22, 600, 300, 6, "#6f7fbb", "#e9eeff")}
        {cloud(500, 330, 1.4, "#ffffffb3", "sc-drift", 110)}
        {hills(23, 620, 30, "#4f8c7a", 3)}
        {pines(24, 640, 90, 26, "#2f6b5b")}
        {hills(25, 680, 16, "#285c4e", 2)}
        <g className="sc-glide">
          <path d="M1000,170 q30,-22 60,0 q30,-22 60,0" fill="none" stroke="#3c3f63" strokeWidth="5" strokeLinecap="round" />
        </g>
      </>
    ),
  }),
  forest: (id) => ({
    sky: ["#bfe0cf", "#e2efd2", "#f8f1d2"],
    body: (
      <>
        {sun(id, 1250, 160, 60, "#fffbe6", "#fff1b5")}
        <g opacity="0.35" className="sc-rays">
          {[0, 1, 2, 3, 4].map((i) => <path key={i} d={`M1250,160 L${700 + i * 120},700 L${760 + i * 120},700 Z`} fill="#fffbe0" />)}
        </g>
        {pines(31, 430, 160, 30, "#8fbf9a")}
        {hills(32, 440, 18, "#8fbf9a", 2)}
        <rect x="0" y="380" width={W} height="80" fill="#f4f1dc" opacity="0.45" className="sc-mist" />
        {pines(33, 540, 220, 22, "#4e9476")}
        {hills(34, 545, 16, "#4e9476", 2)}
        {pines(35, 700, 210, 9, "#2c6650")}
        {hills(36, 690, 10, "#2c6650", 2)}
        <g fill="#e8a43c">
          {[[300, 200], [700, 120], [1100, 260], [500, 330]].map(([x, y], i) => (
            <path key={i} className="sc-fall" style={{ animationDelay: `${-i * 4}s`, animationDuration: `${14 + i * 3}s` }} d={`M${x},${y} q10,-14 22,0 q-10,14 -22,0 Z`} />
          ))}
        </g>
      </>
    ),
  }),
  river: (id) => ({
    sky: ["#f5b8a4", "#f9d4b6", "#fdeccf"],
    body: (
      <>
        {sun(id, 800, 330, 54, "#fff5dd", "#ffd9b0")}
        {cloud(350, 150, 0.9, "#fbd0c2", "sc-drift", 140)}
        {cloud(1250, 120, 1.1, "#fbd9cc", "sc-drift", 120)}
        {hills(41, 380, 40, "#a7c79a", 2)}
        {hills(42, 440, 34, "#7fb08a", 3)}
        <path d={riverPath()} fill={`url(#${id}-river)`} />
        <linearGradient id={`${id}-river`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fbe0c6" />
          <stop offset="0.4" stopColor="#8fd0d6" />
          <stop offset="1" stopColor="#3f9fb8" />
        </linearGradient>
        {[0, 1, 2].map((i) => (
          <path key={i} className="sc-flow" style={{ animationDelay: `${-i * 2}s` }} d={`M${700 - i * 70},${580 + i * 50} q40,-10 80,0`} stroke="#ffffff" strokeOpacity="0.6" strokeWidth="3" fill="none" strokeLinecap="round" />
        ))}
        {hills(43, 560, 26, "#4f9873", 3)}
        <path d={`M0,720 L0,600 C200,560 360,640 470,600 C520,640 480,690 520,720 Z`} fill="#3e8460" />
        <path d={`M1600,720 L1600,580 C1400,560 1200,620 1000,600 C900,640 860,690 840,720 Z`} fill="#3e8460" />
        <g className="sc-sway" stroke="#2c6a4b" strokeWidth="4" strokeLinecap="round">
          {Array.from({ length: 14 }, (_, i) => <path key={i} d={`M${1080 + i * 30},720 q-6,-60 ${(i % 2 ? 8 : -6)},-${90 + (i % 4) * 14}`} />)}
        </g>
      </>
    ),
  }),
  sky: (id) => ({
    sky: ["#4f8fd8", "#86b9ea", "#c8e2f6", "#eef6fb"],
    body: (
      <>
        {sun(id, 1300, 150, 56, "#fffbe8", "#fff3c2")}
        <g opacity="0.35" fill="none" strokeWidth="18">
          {["#f28b82", "#f6bf6b", "#f7e07a", "#8fd19e", "#7fb6e6", "#a99be3"].map((c, i) => <path key={c} d={`M200,700 A600,520 0 0 1 1400,700`} stroke={c} transform={`translate(0 ${i * 18})`} />)}
        </g>
        {cloud(300, 180, 1.6, "#ffffff", "sc-drift", 90)}
        {cloud(900, 260, 2.1, "#f6faff", "sc-drift", 120)}
        {cloud(1350, 400, 1.3, "#ffffff", "sc-drift", 100)}
        <g className="sc-rain" stroke="#d6e8fb" strokeWidth="3" strokeLinecap="round">
          {Array.from({ length: 24 }, (_, i) => <path key={i} d={`M${760 + (i % 8) * 38 + (i * 7) % 15},${320 + Math.floor(i / 8) * 70} l-8,26`} />)}
        </g>
        {hills(51, 640, 26, "#8cc59b", 3)}
        {hills(52, 690, 16, "#5fa678", 2)}
        {birds(500, 420, "#3a5a80")}
      </>
    ),
  }),
  desert: (id) => ({
    sky: ["#f0a07a", "#f6bf8a", "#fbdca6", "#fdeccb"],
    body: (
      <>
        {sun(id, 1100, 300, 90, "#fff2cf", "#ffd59a")}
        {hills(61, 470, 40, "#efb877", 2)}
        {hills(62, 540, 46, "#e3a061", 2)}
        <g fill="#8a5a3a" className="sc-walk">
          <g transform="translate(560 512) scale(1.1)">
            <path d="M0,0 C6,-10 18,-12 26,-6 C32,-28 48,-30 54,-8 C60,-26 78,-28 82,-6 L96,-12 L108,-30 L116,-26 L104,0 C100,6 90,6 86,4 L84,34 L79,34 L77,8 C64,12 40,12 28,8 L26,34 L21,34 L19,6 C10,8 2,6 0,0 Z" />
          </g>
        </g>
        {hills(63, 620, 40, "#cf8a4b", 3)}
        <path d={ridge(ridgePoints(64, 600, 30, 3))} fill="none" stroke="#f6c58c" strokeWidth="3" opacity="0.6" />
        {hills(64, 680, 20, "#b8733c", 2)}
      </>
    ),
  }),
  winter: (id) => ({
    sky: ["#9fb4e0", "#c5d3ef", "#e9eef9"],
    body: (
      <>
        {sun(id, 380, 230, 50, "#fffaf0", "#ffffff")}
        {peaks(71, 470, 220, 6, "#c3cde8", "#ffffff")}
        {hills(72, 520, 30, "#eef2fb", 3)}
        {pines(73, 540, 120, 24, "#4f7f86", "#ffffff")}
        {hills(74, 600, 26, "#f7f9ff", 3)}
        {pines(75, 680, 200, 10, "#2f5f68", "#ffffff")}
        {hills(76, 690, 14, "#ffffff", 2)}
        <g fill="#ffffff" className="sc-snow">
          {Array.from({ length: 70 }, (_, i) => {
            const r = rng(i + 7);
            return <circle key={i} cx={r() * W} cy={r() * H} r={2 + r() * 4} opacity={0.6 + r() * 0.4} />;
          })}
        </g>
      </>
    ),
  }),
  night: (id) => ({
    sky: ["#0f1640", "#27306d", "#4b4a8f", "#8a6aa8"],
    body: (
      <>
        <g fill="#ffffff">
          {Array.from({ length: 90 }, (_, i) => {
            const r = rng(i + 101);
            return <circle key={i} className={i % 3 ? undefined : "sc-twinkle"} style={{ animationDelay: `${-r() * 4}s` }} cx={r() * W} cy={r() * 470} r={0.8 + r() * 2.2} opacity={0.5 + r() * 0.5} />;
          })}
        </g>
        <g className="sc-glow">
          <circle cx="1240" cy="170" r="160" fill={`url(#${id}-moon)`} />
          <radialGradient id={`${id}-moon`}>
            <stop offset="0" stopColor="#fff4d8" stopOpacity="0.55" />
            <stop offset="1" stopColor="#fff4d8" stopOpacity="0" />
          </radialGradient>
        </g>
        <path d="M1240,100 A70,70 0 1 0 1300,210 A56,56 0 1 1 1240,100 Z" fill="#fff1c8" />
        <g transform="translate(330 180)">
          <circle r="38" fill="#e09a7a" />
          <ellipse rx="70" ry="14" fill="none" stroke="#f5d2b8" strokeWidth="5" transform="rotate(-18)" />
        </g>
        <path className="sc-shoot" d="M600,90 l140,60" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
        {peaks(81, 600, 200, 7, "#2a2a5c")}
        {hills(82, 640, 24, "#1d1f48", 3)}
        {pines(83, 690, 120, 20, "#14163a")}
      </>
    ),
  }),
  city: (id) => {
    const r = rng(91);
    const blocks = Array.from({ length: 22 }, (_, i) => ({ x: i * 76 - 20 + r() * 20, w: 50 + r() * 40, h: 90 + r() * 170 }));
    const near = Array.from({ length: 16 }, (_, i) => ({ x: i * 104 - 30 + r() * 20, w: 70 + r() * 40, h: 60 + r() * 120 }));
    return {
      sky: ["#7b78c0", "#e79aa0", "#f6c79f", "#fbe4c4"],
      body: (
        <>
          {sun(id, 420, 430, 66, "#fff1d0", "#ffd2a4")}
          {cloud(1100, 170, 1, "#f7b7b1", "sc-drift", 140)}
          <g fill="#8a7fb5">
            {blocks.map((b, i) => <rect key={i} x={b.x} y={560 - b.h} width={b.w} height={b.h + 160} rx="4" />)}
          </g>
          <g transform="translate(980 0)">
            <path d="M-12,570 L-6,300 L6,300 L12,570 Z" fill="#6e639e" />
            <path d="M0,300 L-52,212 M0,300 L-24,200 M0,300 L24,200 M0,300 L52,212" stroke="#6e639e" strokeWidth="7" strokeLinecap="round" />
            <circle cx="0" cy="205" r="38" fill="#f6c46a" className="sc-glow" />
          </g>
          <g fill="#5b5288">
            {near.map((b, i) => <rect key={i} x={b.x} y={640 - b.h} width={b.w} height={b.h + 100} rx="3" />)}
          </g>
          <g fill="#ffe3a0">
            {near.flatMap((b, i) =>
              Array.from({ length: Math.floor(b.h / 26) * 2 }, (_, k) => {
                const col = k % 2, row = Math.floor(k / 2);
                return (i + k) % 3 ? <rect key={`${i}-${k}`} className={(i * 7 + k) % 11 ? undefined : "sc-twinkle"} x={b.x + 12 + col * (b.w / 2 - 6)} y={640 - b.h + 14 + row * 26} width="12" height="14" rx="2" opacity="0.85" /> : null;
              }),
            )}
          </g>
          <rect x="0" y="660" width={W} height="60" fill="#3f3868" />
          {birds(1250, 300, "#5a4a7a")}
        </>
      ),
    };
  },
};

export function SceneArt({ scene, uid, className }: { scene: Scene; uid: string; className?: string }) {
  const id = `sc-${uid}`;
  const p = PAINT[scene](id);
  return (
    <svg className={`scene ${className ?? ""}`} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" aria-hidden="true" focusable="false">
      <defs>
        {sky(id, p.sky)}
        <filter id={`${id}-grain`} x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" stitchTiles="stitch" />
          <feColorMatrix values="0 0 0 0 0.5  0 0 0 0 0.45  0 0 0 0 0.4  0 0 0 0.35 0" />
          <feComposite in2="SourceGraphic" operator="in" />
        </filter>
      </defs>
      <g className="scene-zoom">
        <rect width={W} height={H} fill={`url(#${id}-sky)`} />
        {p.body}
      </g>
      <rect width={W} height={H} filter={`url(#${id}-grain)`} opacity="0.55" style={{ mixBlendMode: "overlay" }} />
    </svg>
  );
}
