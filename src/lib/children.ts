import "server-only";
import { notFound } from "next/navigation";
import type { DB } from "@/db";
import type { Actor } from "./access";
import { studentsForActor } from "./services";

/** The child a parent is looking at: ?child=<id> when it is theirs, otherwise their first child. */
export async function pickChild(db: DB, actor: Actor, requested?: string) {
  const kids = await studentsForActor(db, actor);
  if (!kids.length) notFound();
  const child = kids.find((k) => k.id === requested) ?? kids[0];
  return { child, kids };
}
