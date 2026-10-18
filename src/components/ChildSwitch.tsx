import Link from "next/link";
import { getT } from "@/lib/i18n/server";

export async function ChildSwitch({ kids, current, base }: { kids: { id: string; displayName: string }[]; current: string; base: string }) {
  if (kids.length < 2) return null;
  const { t } = await getT();
  return (
    <nav className="row" aria-label={t("child.nav")}>
      {kids.map((k) => (
        <Link key={k.id} className={`btn ${k.id === current ? "primary" : ""}`} href={`${base}?child=${k.id}`}>{k.displayName}</Link>
      ))}
    </nav>
  );
}
