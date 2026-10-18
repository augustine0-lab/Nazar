import Link from "next/link";
import { cookies } from "next/headers";
import { Flash } from "./Flash";
import { logoutAction } from "@/app/actions";
import { requireUser } from "@/lib/session";
import type { Role } from "@/db/schema";
import { LangSwitch } from "./LangSwitch";
import { A11yPanel } from "./A11yPanel";
import { NotifyWatcher } from "./BrowserNotify";
import { getDb } from "@/db";
import { totalUnreadChat, unreadNotifications } from "@/lib/feature-services";
import { getPrefs } from "@/lib/prefs-server";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

const NAV: Record<Role, { href: string; label: MsgKey }[]> = {
  TEACHER: [
    { href: "/teacher", label: "nav.myClass" },
    { href: "/teacher/week", label: "nav.week" },
    { href: "/chat", label: "nav.chat" },
    { href: "/techniques", label: "nav.techniques" },
  ],
  PARENT: [
    { href: "/parent", label: "nav.today" },
    { href: "/parent/schedule", label: "nav.schedule" },
    { href: "/parent/rewards", label: "nav.rewards" },
    { href: "/parent/homework", label: "nav.homework" },
    { href: "/parent/plan", label: "nav.planConsent" },
    { href: "/chat", label: "nav.chat" },
  ],
  PSYCHOLOGIST: [{ href: "/psych", label: "nav.myKids" }, { href: "/chat", label: "nav.chat" }, { href: "/techniques", label: "nav.techniques" }],
  STUDENT: [{ href: "/student", label: "nav.myDay" }, { href: "/student/rewards", label: "nav.rewards" }],
  ADMIN: [{ href: "/admin", label: "nav.school" }],
};

export async function Shell({ current, children }: { current: string; children: React.ReactNode }) {
  const user = await requireUser();
  const { t, L } = await getT();
  const flash = (await cookies()).get("nazar_flash")?.value;
  const adult = user.role === "TEACHER" || user.role === "PARENT" || user.role === "PSYCHOLOGIST";
  const db = getDb();
  const [unreadChat, unread, prefs] = await Promise.all([
    adult ? totalUnreadChat(db, user) : 0,
    adult ? unreadNotifications(db, user.id) : [],
    getPrefs(),
  ]);
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">Nazar</Link>
          <nav className="topnav" aria-label={t("nav.sections")}>
            {NAV[user.role].map((n) => (
              <Link key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined}>
                {t(n.label)}
                {n.href === "/chat" && unreadChat > 0 && <span className="badge" aria-label={t("chat.unread", { n: unreadChat })}>{unreadChat}</span>}
              </Link>
            ))}
          </nav>
          <div className="who">
            <span>{L(user.name)} · {t(`role.${user.role}`)}</span>
            {adult && (
              <Link href="/notifications" className="bell" aria-label={unread.length ? t("ntf.bell", { n: unread.length }) : t("nav.notifications")}>
                <span aria-hidden="true">🔔</span>
                {unread.length > 0 && <span className="badge">{unread.length}</span>}
              </Link>
            )}
            <A11yPanel initial={prefs} />
            <LangSwitch />
            <form action={logoutAction}><button className="btn quiet" type="submit">{t("nav.logout")}</button></form>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
      {adult && <NotifyWatcher />}
      <Flash value={flash ? decodeURIComponent(flash) : null} />
    </>
  );
}
