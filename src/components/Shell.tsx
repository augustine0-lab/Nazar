import Link from "next/link";
import { cookies } from "next/headers";
import { Flash } from "./Flash";
import { logoutAction } from "@/app/actions";
import { requireUser } from "@/lib/session";
import type { Role } from "@/db/schema";

const NAV: Record<Role, { href: string; label: string }[]> = {
  TEACHER: [{ href: "/teacher", label: "Мой класс" }, { href: "/techniques", label: "Приёмы" }],
  PARENT: [
    { href: "/parent", label: "Сегодня" },
    { href: "/parent/rewards", label: "Награды" },
    { href: "/parent/homework", label: "Домашка" },
    { href: "/parent/plan", label: "План и согласие" },
  ],
  PSYCHOLOGIST: [{ href: "/psych", label: "Мои дети" }, { href: "/techniques", label: "Приёмы" }],
  STUDENT: [{ href: "/student", label: "Мой день" }, { href: "/student/rewards", label: "Награды" }],
  ADMIN: [{ href: "/admin", label: "Школа" }],
};

const ROLE_LABEL: Record<Role, string> = { TEACHER: "учитель", PARENT: "родитель", PSYCHOLOGIST: "психолог", STUDENT: "ученик", ADMIN: "администратор" };

export async function Shell({ current, children }: { current: string; children: React.ReactNode }) {
  const user = await requireUser();
  const flash = (await cookies()).get("komanda_flash")?.value;
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link href="/" className="brand">Команда вокруг ребёнка</Link>
          <nav className="topnav" aria-label="Разделы">
            {NAV[user.role].map((n) => (
              <Link key={n.href} href={n.href} aria-current={current === n.href ? "page" : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div className="who">
            <span>{user.name} · {ROLE_LABEL[user.role]}</span>
            <form action={logoutAction}><button className="btn quiet" type="submit">Выйти</button></form>
          </div>
        </div>
      </header>
      <main className="page">{children}</main>
      <Flash value={flash ? decodeURIComponent(flash) : null} />
    </>
  );
}
