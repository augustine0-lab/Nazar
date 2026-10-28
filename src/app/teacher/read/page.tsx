import Link from "next/link";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { SceneArt } from "@/components/SceneArt";
import { createReadingAction } from "@/app/actions";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as C from "@/lib/concept-services";
import * as R from "@/lib/reading-services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

/** Living texts of the class: the teacher's list and the form for a new one. */
export default async function TeacherReadings({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireUser("TEACHER");
  const { t, L } = await getT();
  const db = getDb();
  const classes = await C.teacherClasses(db, user);
  const asked = (await searchParams).class;
  const cls = classes.find((c) => c.id === asked) ?? classes[0];
  const list = cls ? await R.readingsOf(db, user, cls.id) : [];

  return (
    <Shell current="/teacher/class">
      <div className="stack" style={{ gap: 2 }}>
        <Link href={`/teacher/class${cls ? `?class=${cls.id}` : ""}`} className="small">← {t("udl.title")}</Link>
        <h1>{t("read.title")}{cls ? `: ${cls.name}` : ""}</h1>
      </div>
      {classes.length > 1 && (
        <nav className="chips" aria-label={t("udl.pickClass")}>
          {classes.map((c) => <Link key={c.id} className="chip" href={`/teacher/read?class=${c.id}`} aria-current={c.id === cls?.id ? "page" : undefined}>{c.name}</Link>)}
        </nav>
      )}
      {!cls ? (
        <p className="muted">{t("udl.noClass")}</p>
      ) : (
        <>
          <p className="muted">{t("read.teacherLead")}</p>
          {list.length ? (
            <div className="lt-cards">
              {list.map((r) => (
                <Link key={r.id} href={`/teacher/read/${r.id}`} className="lt-card">
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
            <p className="muted">{t("read.none")}</p>
          )}

          <section className="card">
            <h2>{t("read.new")}</h2>
            <ActionForm action={createReadingAction} className="stack">
              <input type="hidden" name="classId" value={cls.id} />
              <div className="grid2">
                <label>{t("read.form.title")}<input name="title" maxLength={D.MAX_READING_TITLE} placeholder={t("read.form.titleExample")} required /></label>
                <label>{t("read.form.source")}<input name="source" maxLength={D.MAX_READING_TITLE} placeholder={t("read.form.sourceExample")} /></label>
              </div>
              <label>
                {t("read.form.text")}
                <textarea name="text" rows={12} placeholder={t("read.form.textExample")} required />
              </label>
              <p className="muted small">{t("read.form.hint", { max: D.MAX_CHAPTERS, len: D.MAX_CHAPTER_TEXT })}</p>
              <div><button className="btn primary" type="submit">{t("read.form.create")}</button></div>
            </ActionForm>
          </section>
        </>
      )}
    </Shell>
  );
}
