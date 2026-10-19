import { redirect } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { saveEmailPrefsAction } from "@/app/actions";
import { mailConfigured } from "@/lib/mailer";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";

export default async function AccountPage() {
  const user = await requireUser();
  if (user.role === "STUDENT") redirect("/student");
  const { t, L } = await getT();
  return (
    <Shell current="/account">
      <h1>{t("acc.title")}</h1>
      <p className="muted">{L(user.name)} · {t(`role.${user.role}`)} · {t("acc.login", { login: user.login })}</p>
      <section className="card">
        <h2>{t("acc.mail")}</h2>
        <ActionForm action={saveEmailPrefsAction} className="stack">
          <div className="form-grid">
            <label>{t("acc.email")}<input name="email" type="email" autoComplete="email" defaultValue={user.email ?? ""} maxLength={254} /></label>
            <label>
              {t("acc.lang")}
              <select name="lang" defaultValue={user.emailLang}>
                <option value="ru">Русский</option>
                <option value="kk">Қазақша</option>
              </select>
            </label>
          </div>
          <label className="check"><input type="checkbox" name="notify" defaultChecked={user.emailNotify} /> {t("acc.notify")}</label>
          <div><button className="btn primary" type="submit">{t("acc.save")}</button></div>
        </ActionForm>
        <p className="muted small">{mailConfigured() ? t("acc.smtpOn") : t("acc.smtpOff")} {t("acc.hint")}</p>
      </section>
    </Shell>
  );
}
