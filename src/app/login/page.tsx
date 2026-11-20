import { ActionForm } from "@/components/ActionForm";
import { LangSwitch } from "@/components/LangSwitch";
import { A11yPanel } from "@/components/A11yPanel";
import { getPrefs } from "@/lib/prefs-server";
import { loginAction } from "@/app/actions";
import Link from "next/link";
import { BrandMark, I } from "@/components/ui/Icon";
import { InstallCard } from "@/components/pwa/InstallApp";
import { demoEnabled } from "@/lib/demo-mode";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";
import { TeamStage, type TeamStageCopy } from "@/components/stageshow/TeamStage";

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
  const prefs = await getPrefs();
  const lesson = t("mark.lessonLabel", { n: 3, time: "10:20" });
  const goal = t("demo.goal.hand.adult");
  const stage: TeamStageCopy = {
    card: t("tc.card"),
    child: "Мирас Сейітов",
    klass: "3 «Б»",
    lesson,
    goal,
    yes: t("common.yes"),
    no: t("common.no"),
    before: "75%",
    after: "83%",
    of: t("login.stage.of"),
    notifTitle: t("login.stage.notifTitle", { lesson: t("mark.lessonLabel", { n: 3, time: "" }).replace(/\s*·\s*$/, "") }),
    notifBody: t("login.stage.notifBody", { goal, pct: "83%" }),
    label: t("login.stage.label"),
    now: t("login.stage.now"),
  };
  return (
    <main className="login">
      <section className="login-hero">
        <div className="login-hero-in">
          <div className="login-brand" aria-hidden="true">
            <BrandMark size={44} />
            <p className="login-word">Nazar</p>
          </div>
          <p className="login-motto">{t("app.tagline")}</p>
          <p className="login-how">{t("login.stage.how")}</p>
        </div>
        <TeamStage copy={stage} />
      </section>
      <div className="card login-card">
        <div className="row between">
          <h1><BrandMark size={30} /> {t("app.name")}</h1>
          <div className="row login-tools"><A11yPanel initial={prefs} /><LangSwitch /></div>
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
        <InstallCard compact />
        {process.env.NEXT_PUBLIC_DEMO !== "off" && (
          <div className="demo-logins stack muted">
            <span className="eyebrow">{t("login.demoTitle")}</span>
            {demoEnabled() && <Link className="btn primary" href="/demo"><I name="play" /> {t("login.demoLink")}</Link>}
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
