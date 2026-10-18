import { Shell } from "@/components/Shell";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";

const EV = { STRONG: ["сильные данные", "good"], MODERATE: ["средние данные", "star"], PRACTICE: ["практика", ""] } as const;

export default async function TechniquesPage() {
  const user = await requireUser("TEACHER", "PSYCHOLOGIST");
  const list = await S.allTechniques(getDb());
  const order = { STRONG: 0, MODERATE: 1, PRACTICE: 2 };
  return (
    <Shell current="/techniques">
      <h1>Приёмы для урока</h1>
      <p className="muted">Отсортированы по надёжности данных. {user.role === "PSYCHOLOGIST" ? "Прикрепляйте нужные приёмы к плану ребёнка." : "Приёмы из плана ребёнка показаны рядом с его карточкой."}</p>
      <section className="card">
        <div className="list">
          {[...list].sort((a, b) => order[a.evidence] - order[b.evidence]).map((t) => (
            <article key={t.id} className="stack" style={{ gap: 4 }}>
              <span className="row"><h2>{t.title}</h2><span className={`pill ${EV[t.evidence][1]}`}>{EV[t.evidence][0]}</span></span>
              <p>{t.body}</p>
              {t.source && <p className="muted small">Источник: {t.source}</p>}
            </article>
          ))}
        </div>
      </section>
    </Shell>
  );
}
