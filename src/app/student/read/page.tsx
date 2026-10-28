import Link from "next/link";
import { Shell } from "@/components/Shell";
import { SceneArt } from "@/components/SceneArt";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as R from "@/lib/reading-services";
import { getT } from "@/lib/i18n/server";

/** Living texts the teacher gave the class. */
export default async function StudentReadings() {
  const user = await requireUser("STUDENT");
  const { t, L } = await getT();
  const list = await R.readingsOf(getDb(), user);
  return (
    <Shell current="/student/read">
      <div className="child stack">
        <h1>{t("read.title")}</h1>
        <p className="muted">{t("read.studentLead")}</p>
        {list.length ? (
          <div className="lt-cards">
            {list.map((r) => (
              <Link key={r.id} href={`/student/read/${r.id}`} className="lt-card">
                <span className="thumb"><SceneArt scene={r.chapters[0].scene} uid={`card-${r.id}`} /></span>
                <span className="meta">
                  {r.source && <span className="eyebrow">{L(r.source)}</span>}
                  <b>{L(r.title)}</b>
                  <span className="muted small">{t("read.chapters", { n: r.chapters.length })}</span>
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted">{t("read.noneStudent")}</p>
        )}
      </div>
    </Shell>
  );
}
