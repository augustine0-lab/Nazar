import Link from "next/link";
import { Shell } from "@/components/Shell";
import { NotifyToggle } from "@/components/BrowserNotify";
import { markNotificationsReadAction } from "@/app/actions";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as F from "@/lib/feature-services";
import * as D from "@/lib/domain";
import { notificationText } from "@/lib/notification-text";
import { getT } from "@/lib/i18n/server";

export default async function Notifications() {
  const user = await requireUser("TEACHER", "PARENT", "PSYCHOLOGIST");
  const { lang, t } = await getT();
  const list = await F.notificationsOf(getDb(), user.id);
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <Shell current="/notifications">
      <div className="row between">
        <h1>{t("ntf.title")}</h1>
        {unread > 0 && (
          <form action={markNotificationsReadAction}><button className="btn" type="submit">{t("ntf.markRead")}</button></form>
        )}
      </div>
      <section className="card">
        <div className="list">
          {list.map((n) => {
            const text = notificationText(lang, n);
            return (
              <div key={n.id} className="row between">
                <span style={{ fontWeight: n.readAt ? 400 : 600 }}>
                  {n.href ? <Link href={n.href}>{text}</Link> : text}
                </span>
                <span className="muted small">{D.formatStamp(n.createdAt, lang)}</span>
              </div>
            );
          })}
          {!list.length && <p className="muted">{t("ntf.empty")}</p>}
        </div>
      </section>
      <section className="card"><NotifyToggle /></section>
    </Shell>
  );
}
