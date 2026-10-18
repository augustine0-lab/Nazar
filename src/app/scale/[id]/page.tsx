import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ScaleForm } from "./ScaleForm";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { HOME_BY_ROLE, requireUser } from "@/lib/session";
import * as F from "@/lib/feature-services";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function ScalePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("TEACHER", "PARENT");
  const { lang, t } = await getT();
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "FILL_SCALE", id))) notFound();
  const { student } = await S.getStudent(db, id);
  const mine = await F.scalesOf(db, user, id);
  return (
    <Shell current={HOME_BY_ROLE[user.role]}>
      <div className="stack" style={{ gap: 2 }}>
        <Link href={user.role === "TEACHER" ? `/teacher/student/${id}` : `/parent?child=${id}`} className="small">← {student.displayName}</Link>
        <h1>{t("sc.title")}: {student.displayName}</h1>
      </div>
      <section className="card">
        <p>{t("sc.intro")}</p>
        <p className="muted small">{t("sc.disclaimer")}</p>
        {mine[0] && <p className="msg ok">{t("sc.mine", { date: D.formatDate(mine[0].date, lang) })}</p>}
        <ScaleForm studentId={id} />
      </section>
    </Shell>
  );
}
