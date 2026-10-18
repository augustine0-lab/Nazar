import { MOOD_FACES } from "@/lib/icons";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

/** Seven calendar days of the child's own mood notes; a day with two notes shows their average. */
export async function MoodStrip({ moods, today }: { moods: { date: string; slot: string; mood: number }[]; today: string }) {
  const { lang, t } = await getT();
  const days = Array.from({ length: 7 }, (_, i) => D.addDays(today, i - 6));
  const avg = D.moodAverage(moods.filter((m) => m.date >= days[0]).map((m) => m.mood));
  return (
    <div className="stack">
      <div className="row between">
        <span className="eyebrow">{t("mood.week")}</span>
        {avg !== null && <span className="muted small num">{t("mood.avg", { n: avg })}</span>}
      </div>
      {avg === null ? (
        <p className="muted small">{t("mood.none")}</p>
      ) : (
        <div className="moodstrip">
          {days.map((d) => {
            const a = D.moodAverage(moods.filter((m) => m.date === d).map((m) => m.mood));
            return (
              <div key={d} className="cell">
                {D.shortWeekday(d, lang)}
                <span className="face" role="img" aria-label={a === null ? "—" : t(`mood.${Math.round(a) as 1 | 2 | 3 | 4 | 5}`)}>{a === null ? "·" : MOOD_FACES[Math.round(a) - 1]}</span>
              </div>
            );
          })}
        </div>
      )}
      <p className="muted small">{t("mood.hint")}</p>
    </div>
  );
}
