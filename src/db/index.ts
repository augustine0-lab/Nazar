import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import fs from "node:fs";
import path from "node:path";
import * as schema from "./schema";

export type DB = BetterSQLite3Database<typeof schema>;

export function openDb(file = process.env.DATABASE_PATH ?? "./data/nazar.db"): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  return drizzle(sqlite, { schema });
}

// One connection per server process, opened on first use and reused across hot reloads in dev.
const globalForDb = globalThis as unknown as { __nazarDb?: DB };
export function getDb(): DB {
  globalForDb.__nazarDb ??= openDb();
  return globalForDb.__nazarDb;
}

export { schema };
