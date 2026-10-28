import Link from "next/link";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { LessonBoard } from "@/components/LessonBoard";
import { saveBoardAction } from "@/app/actions";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as C from "@/lib/concept-services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

/** The lesson board for the projector, and the teacher's plan for it. */
export default async function Board({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireUser("TEACHER");
  const { t, L } = await getT();
  const db = getDb();
  const classes = await C.teacherClasses(db, user);
  const asked = (await searchParams).class;
  const cls = classes.find((c) => c.id === asked) ?? classes[0];
  const steps = (cls ? await C.boardOf(db, user, cls.id) : []).map((st) => ({ ...st, text: L(st.text) }));

  return (
    <Shell current="/teacher/class">
      <div className="stack" style={{ gap: 2 }}>
        <Link href={`/teacher/class${cls ? `?class=${cls.id}` : ""}`} className="small">← {t("udl.title")}</Link>
        <h1>{t("board.title")}{cls ? `: ${cls.name}` : ""}</h1>
      </div>
      {!cls ? (
        <p className="muted">{t("udl.noClass")}</p>
      ) : (
        <>
          <p className="muted">{t("board.lead")}</p>
          <LessonBoard key={JSON.stringify(steps)} steps={steps} />
          <section className="card">
            <details open={!steps.length}>
              <summary><h2 style={{ display: "inline" }}>{t("board.edit")}</h2></summary>
              <ActionForm action={saveBoardAction} className="stack">
                <input type="hidden" name="classId" value={cls.id} />
                <p className="muted small">{t("board.editHint", { max: D.MAX_BOARD_STEPS })}</p>
                <textarea name="text" rows={8} defaultValue={D.boardStepsToText(steps)} placeholder={t("board.placeholder")} />
                <button className="btn primary" type="submit">{t("board.save")}</button>
              </ActionForm>
            </details>
          </section>
        </>
      )}
    </Shell>
  );
}
