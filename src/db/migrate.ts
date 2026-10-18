import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb } from "./index";

const db = openDb();
migrate(db, { migrationsFolder: "./drizzle" });
console.log("База данных обновлена.");
