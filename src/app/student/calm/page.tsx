import Link from "next/link";
import { Shell } from "@/components/Shell";
import { BreathBalloon } from "@/components/wow/BreathBalloon";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";

/** «Надуй шарик» on its own: after a quarrel, before a test, whenever the child needs to calm down. */
export default async function Calm() {
  await requireUser("STUDENT");
  const { t } = await getT();
  return (
    <Shell current="/student">
      <div className="child stack">
        <Link href="/student" className="small">{t("st.back")}</Link>
        <h1>{t("bl.pageTitle")}</h1>
        <section className="card"><BreathBalloon /></section>
      </div>
    </Shell>
  );
}
