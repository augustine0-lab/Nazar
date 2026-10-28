import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { ChapterScenes } from "@/components/ChapterScenes";
import { LivingText } from "@/components/LivingText";
import { deleteReadingAction, updateReadingAction } from "@/app/actions";
import { getDb } from "@/db";
import { AccessDenied } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as R from "@/lib/reading-services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

/** The teacher sees the living text as the pupils do (or on the projector), and edits it below. */
export default async function TeacherReading({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("TEACHER");
  const { t, L } = await getT();
  const { id } = await params;
  const db = getDb();
  const r = await R.readingFor(db, user, id).catch((e) => {
    if (e instanceof AccessDenied) notFound();
    throw e;
  });
  const chapters = r.chapters.map((c) => ({ ...c, title: L(c.title), text: L(c.text) }));

  return (
    <Shell current="/teacher/class">
      <Link href={`/teacher/read?class=${r.classId}`} className="small">← {t("read.title")}</Link>
      <LivingText key={JSON.stringify(chapters)} id={r.id} title={L(r.title)} source={L(r.source)} chapters={chapters} projector />

      <section className="card">
        <details>
          <summary><h2 style={{ display: "inline" }}>{t("read.edit")}</h2></summary>
          <ActionForm action={updateReadingAction} className="stack">
            <input type="hidden" name="id" value={r.id} />
            <div className="grid2">
              <label>{t("read.form.title")}<input name="title" maxLength={D.MAX_READING_TITLE} defaultValue={L(r.title)} required /></label>
              <label>{t("read.form.source")}<input name="source" maxLength={D.MAX_READING_TITLE} defaultValue={L(r.source)} /></label>
            </div>
            <label>{t("read.form.text")}<textarea name="text" rows={12} defaultValue={D.chaptersToText(chapters)} required /></label>
            <p className="muted small">{t("read.form.hint", { max: D.MAX_CHAPTERS, len: D.MAX_CHAPTER_TEXT })}</p>
            <h3>{t("read.pictures")}</h3>
            <ChapterScenes id={r.id} chapters={chapters} />
            <div><button className="btn primary" type="submit">{t("read.save")}</button></div>
          </ActionForm>
        </details>
        <ActionForm action={deleteReadingAction}>
          <input type="hidden" name="id" value={r.id} />
          <input type="hidden" name="classId" value={r.classId} />
          <button className="btn quiet" type="submit">{t("read.delete")}</button>
        </ActionForm>
      </section>
    </Shell>
  );
}
