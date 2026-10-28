import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { LivingText } from "@/components/LivingText";
import { getDb } from "@/db";
import { AccessDenied } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as R from "@/lib/reading-services";
import { getT } from "@/lib/i18n/server";

export default async function StudentReading({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("STUDENT");
  const { t, L } = await getT();
  const { id } = await params;
  const r = await R.readingFor(getDb(), user, id).catch((e) => {
    if (e instanceof AccessDenied) notFound();
    throw e;
  });
  const chapters = r.chapters.map((c) => ({ ...c, title: L(c.title), text: L(c.text) }));
  return (
    <Shell current="/student/read">
      <Link href="/student/read" className="small">← {t("read.title")}</Link>
      <LivingText id={r.id} title={L(r.title)} source={L(r.source)} chapters={chapters} />
    </Shell>
  );
}
