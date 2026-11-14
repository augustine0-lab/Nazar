import Link from "next/link";
import { Shell } from "@/components/Shell";
import { QuietRoom } from "@/components/QuietRoom";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as Q from "@/lib/room-services";
import { iceServers } from "@/lib/room/ice";
import { getT } from "@/lib/i18n/server";
import { demoEnabled } from "@/lib/demo-mode";

/** The quiet room of a class: pupils do homework next to each other, an adult may lead it. */
export default async function RoomPage({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireUser("STUDENT", "TEACHER", "PSYCHOLOGIST");
  const { t } = await getT();
  const db = getDb();
  const actor = { id: user.id, role: user.role, schoolId: user.schoolId };
  const pupil = user.role === "STUDENT";
  const classes = pupil ? [] : await Q.hostClasses(db, actor);
  const asked = (await searchParams).class;
  const classId = pupil ? undefined : (classes.find((c) => c.id === asked) ?? classes[0])?.id;
  const access = pupil || classId ? await Q.roomAccess(db, actor, classId) : null;

  const rules = (
    <details className="card">
      <summary><b>{t("room.rulesTitle")}</b></summary>
      <ul className="stack small" style={{ margin: "10px 0 0", paddingLeft: 20 }}>
        <li>{t("room.rule1")}</li>
        <li>{t("room.rule2")}</li>
        <li>{t("room.rule3")}</li>
        <li>{t("room.rule4")}</li>
        <li>{t("room.rule5")}</li>
      </ul>
    </details>
  );

  return (
    <Shell current="/room">
      <div className={pupil ? "child stack" : "stack"} style={{ gap: 16 }}>
        <div className="row between">
          <h1>🤫 {t("room.title")}</h1>
          {access && <span className="muted">{access.className}</span>}
        </div>
        {classes.length > 1 && (
          <nav className="chips" aria-label={t("room.pickClass")}>
            {classes.map((c) => <Link key={c.id} className="chip" href={`/room?class=${c.id}`} aria-current={c.id === classId ? "page" : undefined}>{c.name}</Link>)}
          </nav>
        )}
        <p className="muted">{pupil ? t("room.lead") : t("room.leadHost")}</p>
        {!access ? (
          <section className="card"><p className="muted">{t("room.noClass")}</p></section>
        ) : !access.ok ? (
          <section className="card warn"><p>{access.reason === "parentOff" ? t("room.parentOff") : t("room.noConsent")}</p></section>
        ) : (
          <>
            {!pupil && (
              <p className="muted small">
                {t("room.classRule", { enabled: access.rule.enabled, pupils: access.rule.pupils, free: access.rule.unsupervised })}
              </p>
            )}
            <QuietRoom key={access.classId} classId={access.classId} kind={access.entry.kind} video={access.entry.video} iceServers={iceServers()} demo={demoEnabled()} />
          </>
        )}
        {rules}
      </div>
    </Shell>
  );
}
