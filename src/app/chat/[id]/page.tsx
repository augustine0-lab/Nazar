import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { sendChatAction } from "@/app/actions";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as F from "@/lib/feature-services";
import * as S from "@/lib/services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

export default async function ChatWith({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("TEACHER", "PARENT", "PSYCHOLOGIST");
  const { lang, t, L } = await getT();
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "CHAT", id))) notFound();
  const { student } = await S.getStudent(db, id);
  const list = await F.openChat(db, user, id);
  return (
    <Shell current="/chat">
      <div className="stack" style={{ gap: 2 }}>
        <Link href="/chat" className="small">{t("chat.back")}</Link>
        <h1>{t("chat.about", { name: student.displayName })}</h1>
        <p className="muted small">{t("chat.who")} {t("chat.rule")}</p>
      </div>
      <section className="card">
        <div className="thread" role="log" aria-live="polite">
          {list.map(({ message, author, role }) => {
            const mine = message.authorId === user.id;
            return (
              <div key={message.id} className={`bubble ${mine ? "mine" : ""}`}>
                <span className="who-line">{mine ? t("chat.me") : `${L(author)} · ${t(`role.${role}`)}`} · {D.formatStamp(message.createdAt, lang)}, {message.createdAt.toLocaleTimeString(lang === "kk" ? "kk-KZ" : "ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: D.APP_TZ })}</span>
                {L(message.text)}
              </div>
            );
          })}
          {!list.length && <p className="muted">{t("chat.empty")}</p>}
        </div>
        <ActionForm action={sendChatAction} className="stack">
          <input type="hidden" name="studentId" value={id} />
          <label className="sr-only" htmlFor="chat-text">{t("chat.placeholder")}</label>
          <textarea id="chat-text" name="text" rows={3} maxLength={F.MAX_CHAT_LENGTH} placeholder={t("chat.placeholder")} required />
          <div><button className="btn primary" type="submit">{t("chat.send")}</button></div>
        </ActionForm>
      </section>
    </Shell>
  );
}
