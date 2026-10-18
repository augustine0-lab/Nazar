import Link from "next/link";
import { Shell } from "@/components/Shell";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";

export default async function PsychHome() {
  const user = await requireUser("PSYCHOLOGIST");
  const db = getDb();
  const kids = await S.studentsForActor(db, user);
  const rows = await Promise.all(
    kids.map(async (k) => {
      const [series, consent, plans] = await Promise.all([S.goalSeries(db, k.id, 3), hasActiveConsent(db, k.id), S.plansOf(db, k.id)]);
      const weekPct = (w?: { ratios: (number | null)[] }) => {
        const r = w?.ratios.filter((x): x is number => x !== null) ?? [];
        return r.length ? Math.round((r.reduce((a, b) => a + b, 0) / r.length) * 100) : null;
      };
      const hints = series.goals
        .map((g, i) => ({ g, s: D.goalSuggestion(series.weeks.slice(0, -1).map((w) => w.ratios[i])) }))
        .filter((x) => x.s);
      return { ...k, consent, thisWeek: weekPct(series.weeks.at(-1)), lastWeek: weekPct(series.weeks.at(-2)), hints, pending: plans.some((p) => p.status === "PENDING") };
    }),
  );
  return (
    <Shell current="/psych">
      <h1>Мои дети</h1>
      <section className="card">
        <div className="list">
          {rows.map((r) => (
            <Link key={r.id} href={`/psych/student/${r.id}`} className="list-link">
              <span className="stack" style={{ gap: 2 }}>
                <b>{r.displayName}</b>
                <span className="muted small">{r.className}</span>
                {r.hints.map(({ g, s }) => (
                  <span key={g.id} className="small" style={{ color: "var(--star)" }}>
                    {s === "RAISE" ? "Можно усложнить" : "Стоит упростить"}: «{g.adultText}»
                  </span>
                ))}
              </span>
              <span className="row">
                {!r.consent && <span className="pill star">нет согласия</span>}
                {r.pending && <span className="pill">план ждёт родителя</span>}
                {r.thisWeek !== null && <span className="pill num">эта неделя {r.thisWeek}%</span>}
                {r.lastWeek !== null && <span className="pill num">прошлая {r.lastWeek}%</span>}
              </span>
            </Link>
          ))}
        </div>
      </section>
    </Shell>
  );
}
