import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { unreadNotifications } from "@/lib/feature-services";
import { notificationText } from "@/lib/notification-text";
import { getLang } from "@/lib/i18n/server";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Unread notifications newer than ?since=<ms>, used by the optional on-screen alerts. */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const since = Number(new URL(req.url).searchParams.get("since") ?? 0) || 0;
  const lang = await getLang();
  const all = await unreadNotifications(getDb(), user.id);
  const fresh = all.filter((n) => n.createdAt.getTime() > since);
  return NextResponse.json({
    unread: all.length,
    items: fresh.map((n) => ({ id: n.id, text: notificationText(lang, n), href: n.href, at: n.createdAt.getTime() })),
  });
}
