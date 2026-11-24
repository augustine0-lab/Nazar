import Link from "next/link";
import { Shell } from "@/components/Shell";
import { RecapStories } from "@/components/wow/RecapStories";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { myStudent } from "@/lib/me";
import { requireUser } from "@/lib/session";
import * as W from "@/lib/wow-services";
import { getT } from "@/lib/i18n/server";
import { recapView } from "@/lib/recap-view";

/** «Моя четверть в сторис» for the child. */
export default async function StudentRecap() {
  const user = await requireUser("STUDENT");
  const tr = await getT();
  const db = getDb();
  const me = await myStudent(db, user);
  if (!(await hasActiveConsent(db, me.id))) {
    return (
      <Shell current="/student">
        <section className="card child"><p>{tr.t("st.soon")}</p></section>
      </Shell>
    );
  }
  const v = recapView(await W.recapOf(db, user, me.id), tr);
  return (
    <Shell current="/student">
      <div className="child stack">
        <Link href="/student" className="small">{tr.t("st.back")}</Link>
        <RecapStories name={me.displayName.split(" ")[0]} period={v.period} slides={v.slides} goals={v.goals} studentId={me.id} canChoose />
      </div>
    </Shell>
  );
}
