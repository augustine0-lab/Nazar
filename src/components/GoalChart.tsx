import { formatDate } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

const COLORS = ["var(--c1)", "var(--c2)", "var(--c3)", "var(--c4)"];

/** Grouped bars: share of lessons with the goal met, per week, with the plan threshold as a dashed line. */
export async function GoalChart({
  goals,
  weeks,
  threshold,
}: {
  goals: { id: string; adultText: string }[];
  weeks: { monday: string; ratios: (number | null)[] }[];
  threshold: number;
}) {
  const { lang, t } = await getT();
  const W = 640, H = 240, L = 36, R = 8, T = 14, B = 30;
  const plotH = H - T - B;
  const groupW = (W - L - R) / Math.max(weeks.length, 1);
  const bw = Math.min(20, (groupW - 16) / Math.max(goals.length, 1) - 3);
  const y = (v: number) => T + plotH * (1 - v / 100);
  return (
    <>
      <div className="chart-wrap">
        <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("chart.aria")}>
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} strokeWidth="1" />
              <text x={L - 6} y={y(v) + 4} textAnchor="end">{v}%</text>
            </g>
          ))}
          <line x1={L} x2={W - R} y1={y(threshold)} y2={y(threshold)} stroke="var(--bad)" strokeDasharray="4 4" strokeWidth="1.5" />
          <text x={L + 4} y={y(threshold) - 5} style={{ fill: "var(--bad)", stroke: "var(--surface)", strokeWidth: 4, paintOrder: "stroke" }}>{t("chart.threshold", { n: threshold })}</text>
          {weeks.map((w, i) => {
            const gx = L + i * groupW + (groupW - goals.length * (bw + 3)) / 2;
            return (
              <g key={w.monday}>
                {w.ratios.map((r, j) => {
                  if (r === null) return null;
                  const h = plotH * r;
                  return (
                    <rect key={j} x={gx + j * (bw + 3)} y={T + plotH - h} width={bw} height={Math.max(h, 1.5)} rx="3" fill={COLORS[j % 4]}>
                      <title>{`${goals[j]?.adultText}: ${Math.round(r * 100)}%`}</title>
                    </rect>
                  );
                })}
                <text x={L + i * groupW + groupW / 2} y={H - 10} textAnchor="middle">
                  {i === weeks.length - 1 ? t("chart.thisWeek") : t("chart.weekFrom", { date: formatDate(w.monday, lang) })}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
      <div className="legend">
        {goals.map((g, j) => (
          <span key={g.id}><i style={{ background: COLORS[j % 4] }} />{g.adultText}</span>
        ))}
      </div>
    </>
  );
}
