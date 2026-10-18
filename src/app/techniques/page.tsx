import { Shell } from "@/components/Shell";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import { getT } from "@/lib/i18n/server";

const EV_CLASS = { STRONG: "good", MODERATE: "star", PRACTICE: "" } as const;

export default async function TechniquesPage() {
  const user = await requireUser("TEACHER", "PSYCHOLOGIST");
  const { t, L } = await getT();
  const list = await S.allTechniques(getDb());
  const order = { STRONG: 0, MODERATE: 1, PRACTICE: 2 };
  return (
    <Shell current="/techniques">
      <h1>{t("tech.title")}</h1>
      <p className="muted">{t("tech.sorted")} {user.role === "PSYCHOLOGIST" ? t("tech.psychHint") : t("tech.teacherHint")}</p>
      <section className="card">
        <div className="list">
          {[...list].sort((a, b) => order[a.evidence] - order[b.evidence]).map((tq) => (
            <article key={tq.id} className="stack" style={{ gap: 4 }}>
              <span className="row"><h2>{L(tq.title)}</h2><span className={`pill ${EV_CLASS[tq.evidence]}`}>{t(`ev.${tq.evidence}`)}</span></span>
              <p>{L(tq.body)}</p>
              {tq.source && <p className="muted small">{t("tech.source", { src: L(tq.source) })}</p>}
            </article>
          ))}
        </div>
      </section>
    </Shell>
  );
}
