import { Shell } from "@/components/Shell";
import { ChildSwitch } from "@/components/ChildSwitch";
import { HomeworkForm } from "@/components/HomeworkForm";
import { getDb } from "@/db";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";

export default async function ParentHomework({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  const [list, checks] = await Promise.all([S.homeworkOf(db, child.id), S.selfChecksOf(db, child.id, D.addDays(S.today(), -7))]);
  const onTask = checks.filter((c) => c.onTask).length;

  return (
    <Shell current="/parent/homework">
      <ChildSwitch kids={kids} current={child.id} base="/parent/homework" />
      <h1>Домашние задания</h1>
      <section className="card">
        <h2>Задания</h2>
        <div className="list">
          {list.map((h) => {
            const done = h.steps.filter((s) => s.doneAt).length;
            return (
              <div key={h.id} className="stack" style={{ gap: 6 }}>
                <div className="row between">
                  <b>{h.subject}: {h.title}</b>
                  <span className={`pill ${done === h.steps.length ? "good" : ""}`}>шагов {done} из {h.steps.length} · до {D.formatRuDate(h.dueDate)}</span>
                </div>
                <div className="bar"><i style={{ width: `${(done / h.steps.length) * 100}%` }} /></div>
              </div>
            );
          })}
          {!list.length && <p className="muted">Заданий пока нет.</p>}
        </div>
        <p className="muted small">
          Самопроверки за неделю: {checks.length}, из них «занимаюсь заданием» {onTask}.
        </p>
      </section>
      <section className="card">
        <h2>Новое задание по шагам</h2>
        <HomeworkForm studentId={child.id} defaultDue={D.nextSchoolDay(S.today())} />
      </section>
    </Shell>
  );
}
