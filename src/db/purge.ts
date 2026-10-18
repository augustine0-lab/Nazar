import { purgeRevokedData } from "../lib/services";
import { openDb } from "./index";

// Run once a day (cron, systemd timer): removes children's data 30 days after consent was revoked.
purgeRevokedData(openDb()).then((purged) => {
  console.log(purged.length ? `Удалены данные детей: ${purged.length}.` : "Удалять нечего.");
});
