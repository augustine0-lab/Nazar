import { Shell } from "@/components/Shell";
import { ChildSwitch } from "@/components/ChildSwitch";
import { HomeworkForm } from "@/components/HomeworkForm";
import { getDb } from "@/db";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function ParentHomework({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const { lang, t, L } = await getT();
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  const [list, checks] = await Promise.all([S.homeworkOf(db, child.id), S.selfChecksOf(db, child.id, D.addDays(S.today(), -7))]);
  const onTask = checks.filter((c) => c.onTask).length;

  return (
    <Shell current="/parent/homework">
      <ChildSwitch kids={kids} current={child.id} base="/parent/homework" />
      <h1>{t("phw.title")}</h1>
      <section className="card">
        <h2>{t("phw.tasks")}</h2>
        <div className="list">
          {list.map((h) => {
            const done = h.steps.filter((s) => s.doneAt).length;
            return (
              <div key={h.id} className="stack" style={{ gap: 6 }}>
                <div className="row between">
                  <b>{L(h.subject)}: {L(h.title)}</b>
                  <span className={`pill ${done === h.steps.length ? "good" : ""}`}>{t("phw.progress", { done, n: h.steps.length, date: D.formatDate(h.dueDate, lang) })}</span>
                </div>
                <div className="bar"><i style={{ width: `${(done / h.steps.length) * 100}%` }} /></div>
              </div>
            );
          })}
          {!list.length && <p className="muted">{t("phw.none")}</p>}
        </div>
        <p className="muted small">
          {t("phw.selfChecks", { n: checks.length, on: onTask })}
        </p>
      </section>
      <section className="card">
        <h2>{t("phw.newTitle")}</h2>
        <HomeworkForm studentId={child.id} defaultDue={D.nextSchoolDay(S.today())} />
      </section>
    </Shell>
  );
}
