import "server-only";
import { notFound } from "next/navigation";
import type { DB } from "@/db";
import type { Actor } from "./access";
import { studentsForActor } from "./services";

export async function myStudent(db: DB, actor: Actor) {
  const [me] = await studentsForActor(db, actor);
  if (!me) notFound();
  return me;
}
