// Sends queued e-mail. Without SMTP_URL nothing is sent and letters wait in the outbox,
// so the app works the same on a laptop without a mail server.
import { and, asc, eq } from "drizzle-orm";
import nodemailer, { type Transporter } from "nodemailer";
import type { DB } from "@/db";
import { emailOutbox } from "@/db/schema";

let cached: Transporter | null = null;
function transport(): Transporter | null {
  if (!process.env.SMTP_URL) return null;
  cached ??= nodemailer.createTransport(process.env.SMTP_URL);
  return cached;
}

/** Sends up to `limit` pending letters; failed ones are marked and not retried automatically. */
export async function flushOutbox(db: DB, t: Pick<Transporter, "sendMail"> | null = transport(), limit = 20): Promise<{ sent: number; failed: number }> {
  if (!t) return { sent: 0, failed: 0 };
  const pending = db
    .select()
    .from(emailOutbox)
    .where(eq(emailOutbox.status, "PENDING"))
    .orderBy(asc(emailOutbox.createdAt))
    .limit(limit)
    .all();
  let sent = 0,
    failed = 0;
  for (const m of pending) {
    // Claim the letter first so two requests never send it twice.
    const claimed = db.update(emailOutbox).set({ status: "SENT", sentAt: new Date() }).where(and(eq(emailOutbox.id, m.id), eq(emailOutbox.status, "PENDING"))).run();
    if (!claimed.changes) continue;
    try {
      await t.sendMail({ from: process.env.MAIL_FROM ?? "Nazar <no-reply@localhost>", to: m.to, subject: m.subject, text: m.body });
      sent++;
    } catch (e) {
      db.update(emailOutbox).set({ status: "FAILED", sentAt: null, error: String(e).slice(0, 500) }).where(eq(emailOutbox.id, m.id)).run();
      failed++;
    }
  }
  return { sent, failed };
}
export const mailConfigured = () => Boolean(process.env.SMTP_URL);
