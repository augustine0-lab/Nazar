import { ActionForm } from "@/components/ActionForm";
import { LangSwitch } from "@/components/LangSwitch";
import { loginAction } from "@/app/actions";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

export async function generateMetadata() {
  return { title: (await getT()).t("login.pageTitle") };
}

const DEMO: [string, MsgKey][] = [
  ["aigul", "demo.teacher"],
  ["gulnar", "demo.parent"],
  ["saule", "demo.psych"],
  ["miras", "demo.student"],
  ["admin", "demo.admin"],
];

export default async function LoginPage() {
  const { t } = await getT();
  return (
    <main className="login">
      <div className="card">
        <div className="row between">
          <h1>{t("app.name")}</h1>
          <LangSwitch />
        </div>
        <p className="muted">{t("login.tagline")}</p>
        <ActionForm action={loginAction} className="stack">
          <label>
            {t("login.login")}
            <input name="login" id="login" autoComplete="username" autoCapitalize="none" required />
          </label>
          <label>
            {t("login.password")}
            <input name="password" id="password" type="password" autoComplete="current-password" required />
          </label>
          <button className="btn primary" type="submit">{t("login.submit")}</button>
        </ActionForm>
        {process.env.NEXT_PUBLIC_DEMO !== "off" && (
          <div className="demo-logins stack muted">
            <span className="eyebrow">{t("login.demoTitle")}</span>
            <p>{t("login.demoAdults")} <code>demo1234</code>, {t("login.demoKids")} <code>123456</code>.</p>
            <ul className="stack" style={{ margin: 0, paddingLeft: 18 }}>
              {DEMO.map(([l, who]) => <li key={l}><code>{l}</code> {t(who)}</li>)}
            </ul>
          </div>
        )}
      </div>
    </main>
  );
}
