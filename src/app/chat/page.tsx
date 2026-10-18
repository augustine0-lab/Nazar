import Link from "next/link";
import { Shell } from "@/components/Shell";
import { getDb } from "@/db";
import { requireUser } from "@/lib/session";
import * as F from "@/lib/feature-services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function ChatList() {
  const user = await requireUser("TEACHER", "PARENT", "PSYCHOLOGIST");
  const { lang, t, L } = await getT();
  const threads = await F.chatThreads(getDb(), user);
  return (
    <Shell current="/chat">
      <h1>{t("chat.title")}</h1>
      <section className="card">
        <p className="muted small">{t("chat.who")}</p>
        <div className="list">
          {threads.map((th) => (
            <Link key={th.id} href={`/chat/${th.id}`} className="list-link">
              <span className="stack" style={{ gap: 2, minWidth: 0 }}>
                <b>{th.displayName}</b>
                <span className="muted small" style={{ overflowWrap: "anywhere" }}>
                  {th.last ? `${D.formatStamp(th.last.createdAt, lang)}: ${L(th.last.text).slice(0, 90)}` : t("chat.empty")}
                </span>
              </span>
              {th.unread > 0 && <span className="pill bad">{t("chat.unread", { n: th.unread })}</span>}
            </Link>
          ))}
          {!threads.length && <p className="muted">{t("chat.none")}</p>}
        </div>
      </section>
    </Shell>
  );
}
