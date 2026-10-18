// Sends letters waiting in the outbox (for example from a cron job): npm run mail:flush
import { openDb } from "./index";
import { flushOutbox } from "../lib/mailer";

flushOutbox(openDb(), undefined, 200).then((res) =>
  console.log(process.env.SMTP_URL ? `sent ${res.sent}, failed ${res.failed}` : "SMTP_URL is not set, nothing sent"),
);
