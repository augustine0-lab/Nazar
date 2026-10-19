// Run when the container starts: brings the schema up to date and, for a demo server,
// fills an empty database with the demo school (DEMO_SEED=on). Real data is never touched.
import { count } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb } from "./index";
import { users } from "./schema";
import { seed } from "./seed";

const db = openDb();
migrate(db, { migrationsFolder: "./drizzle" });
const [{ n }] = db.select({ n: count() }).from(users).all();
if (n === 0 && process.env.DEMO_SEED === "on") {
  seed(db);
  console.log("Nazar: demo school created");
} else {
  console.log(`Nazar: database ready, ${n} users`);
}
