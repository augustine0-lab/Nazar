import { Shell } from "@/components/Shell";
import { ChildSwitch } from "@/components/ChildSwitch";
import { RecapStories } from "@/components/wow/RecapStories";
import { getDb } from "@/db";
import { hasActiveConsent } from "@/lib/access";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as W from "@/lib/wow-services";
import { getT } from "@/lib/i18n/server";
import { recapView } from "@/lib/recap-view";

/** The same stories for the parent: something to watch together and talk about. */
export default async function ParentRecap({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const tr = await getT();
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  if (!(await hasActiveConsent(db, child.id))) {
    return (
      <Shell current="/parent/week">
        <ChildSwitch kids={kids} current={child.id} base="/parent/recap" />
        <section className="card warn"><p>{tr.t("parent.needConsent.body")}</p></section>
      </Shell>
    );
  }
  const v = recapView(await W.recapOf(db, user, child.id), tr);
  return (
    <Shell current="/parent/week">
      <ChildSwitch kids={kids} current={child.id} base="/parent/recap" />
      <h1>{tr.t("rc.parentTitle", { name: child.displayName })}</h1>
      <p className="muted">{tr.t("rc.parentLead")}</p>
      <RecapStories name={child.displayName.split(" ")[0]} period={v.period} slides={v.slides} goals={v.goals} studentId={child.id} canChoose={false} />
    </Shell>
  );
}
