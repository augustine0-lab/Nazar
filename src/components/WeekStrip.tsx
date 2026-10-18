import { pct, shortWeekday, type Tally } from "@/lib/domain";

export function WeekStrip({ days, today }: { days: { date: string; tally: Tally; success: boolean }[]; today: string }) {
  return (
    <div className="week">
      {days.map((d) => {
        const p = pct(d.tally.ratio);
        return (
          <div key={d.date} className={`cell ${d.success ? "success" : ""} ${d.date === today ? "today" : ""}`}>
            {shortWeekday(d.date)}
            <b>{p === null ? "—" : `${p}%`}</b>
            <span className="small">{d.success ? "цель дня ✓" : " "}</span>
          </div>
        );
      })}
    </div>
  );
}
