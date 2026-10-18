// Makes a consistent copy of the database while the app keeps running: npm run db:backup [folder]
import fs from "node:fs";
import path from "node:path";
import { openDb } from "./index";

const dir = process.argv[2] ?? "./backups";
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const file = path.join(dir, `nazar-${stamp}.db`);
const db = openDb();
db.$client.backup(file).then(() => console.log(`Резервная копия / Сақтық көшірме: ${file}`));
