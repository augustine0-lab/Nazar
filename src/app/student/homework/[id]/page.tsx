import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { Steps } from "./Steps";
import { FocusTimer } from "./FocusTimer";
import { getDb } from "@/db";
import { myStudent } from "@/lib/me";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import { getT } from "@/lib/i18n/server";

export default async function HomeworkPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("STUDENT");
  const { t, L } = await getT();
  const db = getDb();
  const me = await myStudent(db, user);
  const { id } = await params;
  const hw = (await S.homeworkOf(db, me.id, "0000-00-00")).find((h) => h.id === id);
  if (!hw) notFound();
  const plan = await S.planFor(db, me.id, S.workDay());
  return (
    <Shell current="/student">
      <div className="child stack">
        <Link href="/student" className="small">{t("st.back")}</Link>
        <h1>{L(hw.subject)}: {L(hw.title)}</h1>
        <section className="card">
          <Steps steps={hw.steps.map((s) => ({ id: s.id, text: L(s.text), done: Boolean(s.doneAt) }))} />
        </section>
        <section className="card">
          <h2>{t("st.timer")}</h2>
          <FocusTimer studentId={me.id} homeworkId={hw.id} workMin={plan?.workMinutes ?? 10} breakMin={plan?.breakMinutes ?? 3} />
        </section>
      </div>
    </Shell>
  );
}
