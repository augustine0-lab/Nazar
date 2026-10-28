import { formatDate } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

type Point = { date: string; ratio: number | null };

/** The classic single-case graph: daily results before the change and during it, with the average of each phase. */
export async function TrialChart({ before, during, beforeMean, duringMean }: { before: Point[]; during: Point[]; beforeMean: number | null; duringMean: number | null }) {
  const { lang, t } = await getT();
  const W = 640, H = 220, L = 36, R = 8, T = 22, B = 28;
  const all = [...before, ...during];
  const step = (W - L - R) / Math.max(all.length, 1);
  const x = (i: number) => L + step * (i + 0.5);
  const y = (v: number) => T + (H - T - B) * (1 - v);
  const split = L + step * before.length;
  const path = (pts: Point[], offset: number) =>
    pts
      .map((p, i) => (p.ratio === null ? null : `${x(i + offset).toFixed(1)},${y(p.ratio).toFixed(1)}`))
      .filter(Boolean)
      .join(" ");
  const meanLine = (m: number | null, x1: number, x2: number, color: string) =>
    m === null ? null : <line x1={x1} x2={x2} y1={y(m)} y2={y(m)} stroke={color} strokeDasharray="6 4" strokeWidth="1.5" />;
  return (
    <div className="chart-wrap">
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("tr.chartAria")}>
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} strokeWidth="1" />
            <text x={L - 6} y={y(v) + 4} textAnchor="end">{v * 100}%</text>
          </g>
        ))}
        <line x1={split} x2={split} y1={T - 14} y2={H - B} stroke="var(--fg)" strokeWidth="1.5" />
        <text x={split - 6} y={T - 6} textAnchor="end">{t("tr.before")}</text>
        <text x={split + 6} y={T - 6}>{t("tr.during")}</text>
        {meanLine(beforeMean, L, split, "var(--muted)")}
        {meanLine(duringMean, split, W - R, "var(--accent)")}
        <polyline points={path(before, 0)} fill="none" stroke="var(--muted)" strokeWidth="2" />
        <polyline points={path(during, before.length)} fill="none" stroke="var(--accent)" strokeWidth="2.5" />
        {all.map((p, i) =>
          p.ratio === null ? null : (
            <circle key={p.date} cx={x(i)} cy={y(p.ratio)} r="4" fill={i < before.length ? "var(--muted)" : "var(--accent)"}>
              <title>{`${formatDate(p.date, lang)}: ${Math.round(p.ratio * 100)}%`}</title>
            </circle>
          ),
        )}
        {all.length > 0 && (
          <>
            <text x={x(0)} y={H - 8} textAnchor="start">{formatDate(all[0].date, lang)}</text>
            <text x={x(all.length - 1)} y={H - 8} textAnchor="end">{formatDate(all[all.length - 1].date, lang)}</text>
          </>
        )}
      </svg>
    </div>
  );
}
