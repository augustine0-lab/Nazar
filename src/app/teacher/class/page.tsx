import Link from "next/link";
import { Shell } from "@/components/Shell";
import { UdlChecklist } from "@/components/UdlChecklist";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as C from "@/lib/concept-services";
import { UDL_SUPPORTS } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

/**
 * Universal design for learning: supports the whole class gets, so a child with ADHD does not have to be
 * singled out. The needs from individual plans are shown without names, next to the matching class support.
 */
export default async function ClassForAll({ searchParams }: { searchParams: Promise<{ class?: string }> }) {
  const user = await requireUser("TEACHER");
  const { t, L } = await getT();
  const db = getDb();
  const classes = await C.teacherClasses(db, user);
  const asked = (await searchParams).class;
  const cls = classes.find((c) => c.id === asked) ?? classes[0];
  const [enabled, { pupils, needs }] = cls
    ? await Promise.all([C.classSupportsOf(db, user, cls.id), C.classNeeds(db, user, cls.id)])
    : [new Set<string>(), { pupils: 0, needs: [] }];
  const supportTitle = (k: string) => {
    const s = UDL_SUPPORTS.find((x) => x.key === k);
    return s ? `${s.icon} ${t(`udl.${s.key}.title` as MsgKey)}` : "";
  };

  return (
    <Shell current="/teacher/class">
      <div className="row between">
        <h1>{t("udl.title")}</h1>
        {cls && <span className="muted">{cls.name}</span>}
      </div>
      {classes.length > 1 && (
        <nav className="chips" aria-label={t("udl.pickClass")}>
          {classes.map((c) => <Link key={c.id} className="chip" href={`/teacher/class?class=${c.id}`} aria-current={c.id === cls?.id ? "page" : undefined}>{c.name}</Link>)}
        </nav>
      )}
      {!cls ? (
        <p className="muted">{t("udl.noClass")}</p>
      ) : (
      <>
        <section className="card">
          <p>{t("udl.lead")}</p>
          <div className="row">
            <Link className="btn primary" href={`/teacher/board?class=${cls.id}`}>🗂️ {t("board.open")}</Link>
          </div>
        </section>

        <section className="card">
          <h2>{t("udl.needsTitle")}</h2>
          <p className="muted small">{t("udl.needsLead", { n: pupils })}</p>
          {needs.length ? (
            <div className="list">
              {needs.map((x) => (
                <div key={x.technique.id} className="stack" style={{ gap: 4 }}>
                  <div className="row between">
                    <b>{L(x.technique.title)}</b>
                    <span className="pill num">{t("udl.needN", { n: x.n })}</span>
                  </div>
                  {x.support ? (
                    x.covered ? (
                      <span className="msg ok">✓ {t("udl.covered", { support: supportTitle(x.support) })}</span>
                    ) : (
                      <span className="msg" style={{ background: "var(--star-soft)" }}>{t("udl.canCover", { support: supportTitle(x.support) })}</span>
                    )
                  ) : (
                    <span className="muted small">{t("udl.individual")}</span>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">{t("udl.noNeeds")}</p>
          )}
        </section>

        <section className="card">
          <h2>{t("udl.checkTitle")}</h2>
          <p className="muted small">{t("udl.checkLead")}</p>
          <UdlChecklist classId={cls.id} enabled={[...enabled]} />
          <p className="muted small">{t("udl.source")}</p>
        </section>
      </>
      )}
    </Shell>
  );
}
