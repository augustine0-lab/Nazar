import Link from "next/link";
import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { myStudent } from "@/lib/me";
import { requireUser } from "@/lib/session";
import * as M from "@/lib/more-services";
import { libraryStories } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function StudentStories() {
  const user = await requireUser("STUDENT");
  const { t, L } = await getT();
  const db = getDb();
  const me = await myStudent(db, user);
  if (!(await hasActiveConsent(db, me.id))) redirect("/student");
  const mine = await M.storiesOf(db, user, me.id);
  const card = (s: { id: string; title: string; icon: string; n: number }) => (
    <Link key={s.id} href={`/student/stories/${s.id}`} className="story-card">
      <span className="story-pic" aria-hidden="true">{s.icon}</span>
      <span>{L(s.title)}</span>
    </Link>
  );
  return (
    <Shell current="/student/stories">
      <div className="child stack">
        <h1>{t("story.title")}</h1>
        <p className="muted">{t("story.lead")}</p>
        {mine.length > 0 && (
          <section className="card">
            <h2>{t("story.mine")}</h2>
            <div className="story-grid">{mine.map((s) => card({ id: s.id, title: s.title, icon: s.steps[0]?.icon ?? "📖", n: s.steps.length }))}</div>
          </section>
        )}
        <section className="card">
          <h2>{t("story.library")}</h2>
          <div className="story-grid">{libraryStories().map((s) => card({ ...s, n: s.steps.length }))}</div>
        </section>
      </div>
    </Shell>
  );
}
