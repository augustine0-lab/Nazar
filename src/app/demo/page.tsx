import Link from "next/link";
import { cookies } from "next/headers";
import { Flash } from "@/components/Flash";
import { LangSwitch } from "@/components/LangSwitch";
import { demoLoginAction, resetDemoAction } from "@/app/actions";
import { demoEnabled } from "@/lib/demo-mode";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: `${(await getT()).t("demo.page.title")} · Nazar` };
}

const ADULTS: [string, string, MsgKey][] = [
  ["aigul", "👩‍🏫", "demo.teacher"],
  ["nurlan", "👨‍🏫", "demo.teacher2"],
  ["gulnar", "👩", "demo.parent"],
  ["erlan", "👨", "demo.parent2"],
  ["dana", "👩", "demo.parent3"],
  ["saule", "🧑‍⚕️", "demo.psych"],
  ["admin", "🏫", "demo.admin"],
];
const KIDS: [string, string, MsgKey][] = [
  ["miras", "🧒", "demo.student"],
  ["aliya", "👧", "demo.student2"],
  ["sanzhar", "👦", "demo.student3"],
];

/** Show mode: log in as anyone with one click and put the demo school back to its start. */
export default async function DemoPage() {
  const { t } = await getT();
  const flash = (await cookies()).get("nazar_flash")?.value;
  const on = demoEnabled();
  const who = ([login, icon, label]: [string, string, MsgKey]) => (
    <form key={login} action={demoLoginAction}>
      <input type="hidden" name="login" value={login} />
      <button className="demo-role" type="submit">
        <span aria-hidden="true">{icon}</span>
        <span><b>{login}</b><br /><span className="muted small">{t(label)}</span></span>
      </button>
    </form>
  );
  return (
    <main className="login">
      <div className="card" style={{ maxWidth: 640 }}>
        <div className="row between">
          <h1>{t("demo.page.title")}</h1>
          <LangSwitch />
        </div>
        {on ? (
          <>
            <p className="muted">{t("demo.page.lead")}</p>
            <h2>{t("demo.page.adults")}</h2>
            <div className="demo-grid">{ADULTS.map(who)}</div>
            <h2>{t("demo.page.kids")}</h2>
            <div className="demo-grid">{KIDS.map(who)}</div>
            <form action={resetDemoAction} className="stack" style={{ marginTop: 16 }}>
              <button className="btn quiet danger" type="submit">↺ {t("demo.page.reset")}</button>
              <p className="muted small">{t("demo.page.resetHint")}</p>
            </form>
          </>
        ) : (
          <p>{t("demo.page.off")}</p>
        )}
        <Link href="/login">{t("demo.page.toLogin")}</Link>
      </div>
      <Flash value={flash ? decodeURIComponent(flash) : null} />
    </main>
  );
}
