import Link from "next/link";
import { cookies } from "next/headers";
import { Flash } from "./Flash";
import { logoutAction } from "@/app/actions";
import { requireUser } from "@/lib/session";
import type { Role } from "@/db/schema";
import { LangSwitch } from "./LangSwitch";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

const NAV: Record<Role, { href: string; label: MsgKey }[]> = {
  TEACHER: [{ href: "/teacher", label: "nav.myClass" }, { href: "/techniques", label: "nav.techniques" }],
  PARENT: [
    { href: "/parent", label: "nav.today" },
    { href: "/parent/rewards", label: "nav.rewards" },
    { href: "/parent/homework", label: "nav.homework" },
    { href: "/parent/plan", label: "nav.planConsent" },
  ],
  PSYCHOLOGIST: [{ href: "/psych", label: "nav.myKids" }, { href: "/techniques", label: "nav.techniques" }],
  STUDENT: [{ href: "/student", label: "nav.myDay" }, { href: "/student/rewards", label: "nav.rewards" }],
  ADMIN: [{ href: "/admin", label: "nav.school" }],
};

export async function Shell({ current, children }: { current: string; children: React.ReactNode }) {
  const user = await requireUser();
  const { t, L } = await getT();
  const flash = (await cookies()).get("nazar_flash")?.value;
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">Nazar</Link>
          <nav className="topnav" aria-label={t("nav.sections")}>
            {NAV[user.role].map((n) => (
              <Link key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined}>{t(n.label)}</Link>
            ))}
          </nav>
          <div className="who">
            <span>{L(user.name)} · {t(`role.${user.role}`)}</span>
            <LangSwitch />
            <form action={logoutAction}><button className="btn quiet" type="submit">{t("nav.logout")}</button></form>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
      <Flash value={flash ? decodeURIComponent(flash) : null} />
    </>
  );
}
