import { I } from "@/components/ui/Icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { Shell } from "@/components/Shell";
import { Steps } from "./Steps";
import { FocusTimer } from "./FocusTimer";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { myStudent } from "@/lib/me";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as X from "@/lib/flex-services";
import { getT } from "@/lib/i18n/server";
import { DealBox } from "@/components/flex/Deals";
import { ActualTime } from "@/components/flex/ActualTime";
import { SoundPlayer } from "@/components/flex/SoundPlayer";
import { SoundCard } from "@/components/flex/SoundCard";
import { StarterBanner } from "@/components/flex/StarterBanner";

export default async function HomeworkPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ start?: string }> }) {
  const user = await requireUser("STUDENT");
  const { t, L } = await getT();
  const db = getDb();
  const me = await myStudent(db, user);
  const { id } = await params;
  const { start } = await searchParams;
  const hw = (await S.homeworkOf(db, me.id, "0000-00-00")).find((h) => h.id === id);
  if (!hw) notFound();
  const [plan, deals, author, sound] = await Promise.all([
    S.planFor(db, me.id, S.workDay()),
    X.dealsFor(db, [hw.id]),
    db.query.users.findFirst({ where: eq(users.id, hw.authorId) }),
    X.soundReport(db, user, me.id),
  ]);
  const allDone = hw.steps.every((s) => s.doneAt);
  const firstOpen = hw.steps.find((s) => !s.doneAt);
  const authorIsAdult = author?.role === "TEACHER" || author?.role === "PARENT";
  return (
    <Shell current="/student">
      <div className="child stack">
        <Link href="/student" className="small">{t("st.back")}</Link>
        <h1>{L(hw.subject)}: {L(hw.title)}</h1>
        {start === "1" && !allDone && <StarterBanner step={firstOpen ? L(firstOpen.text) : null} />}
        <section className="card">
          <Steps steps={hw.steps.map((s) => ({ id: s.id, text: L(s.text), done: Boolean(s.doneAt) }))} />
          {allDone && <ActualTime homeworkId={hw.id} initial={hw.actualMinutes} est={hw.estMinutes} />}
        </section>
        <section className="card">
          <h2>{t("st.timer")}</h2>
          <FocusTimer studentId={me.id} homeworkId={hw.id} workMin={plan?.workMinutes ?? 10} breakMin={plan?.breakMinutes ?? 3} />
        </section>
        <section className="card">
          <h2><I name="sound" /> {t("snd.title")}</h2>
          <SoundPlayer initial={sound?.trial.sound ?? "rain"} day={sound && sound.today !== "DONE" && sound.today !== "NOT_STARTED" ? sound.today : null} />
          <details open={Boolean(sound)}>
            <summary>{t("snd.trialTitle")}</summary>
            <div style={{ marginTop: 12 }}><SoundCard studentId={me.id} report={sound} manage /></div>
          </details>
        </section>
        <section className="card" id="deals">
          <h2><I name="deal" /> {t("deal.title")}</h2>
          <p className="muted small">{t("deal.lead")}</p>
          <DealBox homeworkId={hw.id} deals={deals} authorIsAdult={authorIsAdult} />
        </section>
      </div>
    </Shell>
  );
}
