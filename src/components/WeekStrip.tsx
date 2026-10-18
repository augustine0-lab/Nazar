import { pct, shortWeekday, type Tally } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export async function WeekStrip({ days, today }: { days: { date: string; tally: Tally; success: boolean }[]; today: string }) {
  const { lang, t } = await getT();
  return (
    <div className="week">
      {days.map((d) => {
        const p = pct(d.tally.ratio);
        return (
          <div key={d.date} className={`cell ${d.success ? "success" : ""} ${d.date === today ? "today" : ""}`}>
            {shortWeekday(d.date, lang)}
            <b>{p === null ? "—" : `${p}%`}</b>
            <span className="small">{d.success ? t("week.goalDay") : " "}</span>
          </div>
        );
      })}
    </div>
  );
}
