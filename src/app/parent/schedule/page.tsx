import { Shell } from "@/components/Shell";
import { ChildSwitch } from "@/components/ChildSwitch";
import { ScheduleEditor } from "@/components/ScheduleEditor";
import { ScheduleList } from "@/components/ScheduleList";
import { BagEditor } from "@/components/BagEditor";
import * as M from "@/lib/more-services";
import { getDb } from "@/db";
import { can, hasActiveConsent } from "@/lib/access";
import { pickChild } from "@/lib/children";
import { requireUser } from "@/lib/session";
import * as F from "@/lib/feature-services";
import * as S from "@/lib/services";
import { getT } from "@/lib/i18n/server";

export default async function ParentSchedule({ searchParams }: { searchParams: Promise<{ child?: string }> }) {
  const user = await requireUser("PARENT");
  const { t } = await getT();
  const db = getDb();
  const { child, kids } = await pickChild(db, user, (await searchParams).child);
  const consent = await hasActiveConsent(db, child.id);
  const [all, day, bag] = consent
    ? await Promise.all([F.scheduleOf(db, child.id), F.scheduleForDay(db, child.id, S.today()), M.bagFor(db, child.id, S.today())])
    : [[], null, null];
  return (
    <Shell current="/parent/schedule">
      <ChildSwitch kids={kids} current={child.id} base="/parent/schedule" />
      <h1>{t("sch.parentTitle")}: {child.displayName}</h1>
      {!consent || !(await can(db, user, "MANAGE_SCHEDULE", child.id)) ? (
        <section className="card warn"><p>{t("parent.needConsent.body")}</p></section>
      ) : (
        <>
          <section className="card">
            <h2>{t("sch.title")}</h2>
            <ScheduleList items={day!.items.map((i) => ({ id: i.id, time: i.time, title: i.title, icon: i.icon }))} doneIds={[...day!.doneIds]} interactive={false} />
          </section>
          <section className="card">
            <h2>{t("sch.editor")}</h2>
            <ScheduleEditor studentId={child.id} items={all} />
          </section>
          <section className="card">
            <div className="row between">
              <h2>🎒 {t("bag.editor")}</h2>
              {bag!.items.length > 0 && <span className="pill">{t("bag.today", { done: bag!.items.filter((i) => bag!.doneIds.has(i.id)).length, total: bag!.items.length })}</span>}
            </div>
            <BagEditor studentId={child.id} items={bag!.items} />
          </section>
        </>
      )}
    </Shell>
  );
}
