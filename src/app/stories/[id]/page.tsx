import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { deleteStoryAction, saveStoryAction } from "@/app/actions";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as M from "@/lib/more-services";
import * as S from "@/lib/services";
import { libraryStories, MAX_STORY_STEPS } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

/** Parents and the psychologist write the child's own social stories here. */
export default async function StoriesEditor({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("PARENT", "PSYCHOLOGIST");
  const { t, L } = await getT();
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "MANAGE_STORIES", id))) notFound();
  const [{ student }, mine] = await Promise.all([S.getStudent(db, id), M.storiesOf(db, user, id)]);
  const back = user.role === "PARENT" ? `/parent?child=${id}` : `/psych/student/${id}`;
  return (
    <Shell current={user.role === "PARENT" ? "/parent" : "/psych"}>
      <Link href={back} className="small">← {student.displayName}</Link>
      <h1>{t("story.editTitle", { name: student.displayName })}</h1>
      <p className="muted">{t("story.editHint")}</p>

      <section className="card">
        <h2>{t("story.mine")}</h2>
        {mine.length ? (
          <div className="list">
            {mine.map((s) => (
              <div key={s.id} className="stack" style={{ gap: 6 }}>
                <div className="row between">
                  <b>{L(s.title)}</b>
                  <ActionForm action={deleteStoryAction}>
                    <input type="hidden" name="studentId" value={id} />
                    <input type="hidden" name="storyId" value={s.id} />
                    <button className="btn quiet" type="submit">{t("story.delete")}</button>
                  </ActionForm>
                </div>
                <ol className="small" style={{ margin: 0, paddingLeft: 20 }}>
                  {s.steps.map((st, i) => <li key={i}><span aria-hidden="true">{st.icon}</span> {L(st.text)}</li>)}
                </ol>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">{t("story.noneMine")}</p>
        )}
      </section>

      <section className="card">
        <h2>{t("story.form.add")}</h2>
        <ActionForm action={saveStoryAction} className="stack">
          <input type="hidden" name="studentId" value={id} />
          <label>{t("story.form.title")}<input name="title" maxLength={60} placeholder={t("story.form.titleExample")} required /></label>
          <label>
            {t("story.form.steps")}
            <textarea name="steps" rows={MAX_STORY_STEPS - 2} placeholder={t("story.form.stepsExample")} required />
          </label>
          <p className="muted small">{t("story.form.stepsHint")}</p>
          <div><button className="btn primary" type="submit">{t("story.form.add")}</button></div>
        </ActionForm>
      </section>

      <section className="card">
        <h2>{t("story.library")}</h2>
        <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
          {libraryStories().map((s) => <li key={s.id}><span aria-hidden="true">{s.icon}</span> {L(s.title)} <span className="muted small">· {t("story.steps", { n: s.steps.length })}</span></li>)}
        </ul>
      </section>
    </Shell>
  );
}
