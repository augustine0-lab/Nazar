import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { AccessDenied } from "@/lib/access";
import { ROOM_ACTIVITIES, ROOM_DEMO_MINUTES, isRoomTimer } from "@/lib/domain";
import { roomAccess } from "@/lib/room-services";
import { RoomError, roomHub } from "@/lib/room/hub";
import { currentUser } from "@/lib/session";
import { demoEnabled } from "@/lib/demo-mode";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const id = z.string().uuid();
const activity = z.enum(ROOM_ACTIVITIES);
// A session description or a network candidate. Kept small: nothing else can be sent through the room.
const signalData = z.union([
  z.object({ sdp: z.object({ type: z.enum(["offer", "answer"]), sdp: z.string().max(20_000) }) }),
  z.object({
    candidate: z.object({
      candidate: z.string().max(1_000),
      sdpMid: z.string().max(64).nullable().optional(),
      sdpMLineIndex: z.number().int().min(0).max(16).nullable().optional(),
      usernameFragment: z.string().max(256).nullable().optional(),
    }),
  }),
]);

const Body = z.discriminatedUnion("type", [
  z.object({ type: z.literal("join"), classId: id, connId: id, activity }),
  z.object({ type: z.literal("leave"), classId: id, connId: id }),
  z.object({ type: z.literal("state"), classId: id, connId: id, cam: z.boolean().optional(), mic: z.boolean().optional(), activity: activity.optional() }),
  z.object({ type: z.literal("timer"), classId: id, connId: id, minutes: z.number().refine((m) => isRoomTimer(m) || (m === ROOM_DEMO_MINUTES && demoEnabled())) }),
  z.object({ type: z.literal("stopTimer"), classId: id, connId: id }),
  z.object({ type: z.literal("thumb"), classId: id, connId: id, to: id }),
  z.object({ type: z.literal("signal"), classId: id, connId: id, to: id, data: signalData }),
  z.object({ type: z.literal("force"), classId: id, connId: id, target: id, what: z.enum(["cam", "mic"]) }),
  z.object({ type: z.literal("close"), classId: id, connId: id }),
]);

/** Everything a person does in the room. Each request is checked against the database and against the caller's own connection. */
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "access.denied" }, { status: 401 });
  const raw = await req.text();
  if (raw.length > 40_000) return NextResponse.json({ error: "err.fields" }, { status: 413 });
  let body: z.infer<typeof Body>;
  try {
    body = Body.parse(JSON.parse(raw));
  } catch {
    return NextResponse.json({ error: "err.fields" }, { status: 400 });
  }
  const hub = roomHub();
  const uid = user.id;
  try {
    switch (body.type) {
      case "join": {
        // Rights are read again on every entry: a parent may have turned the room off a minute ago.
        const access = await roomAccess(getDb(), { id: uid, role: user.role, schoolId: user.schoolId }, body.classId);
        if (!access.ok || access.classId !== body.classId) throw new AccessDenied();
        return NextResponse.json(hub.join(body.classId, body.connId, access.entry, body.activity));
      }
      case "leave":
        hub.leave(body.classId, body.connId, uid);
        break;
      case "state":
        hub.update(body.classId, body.connId, uid, { cam: body.cam, mic: body.mic, activity: body.activity });
        break;
      case "timer":
        hub.startTimer(body.classId, body.connId, uid, body.minutes);
        break;
      case "stopTimer":
        hub.stopTimer(body.classId, body.connId, uid);
        break;
      case "thumb":
        hub.thumb(body.classId, body.connId, uid, body.to);
        break;
      case "signal":
        hub.signal(body.classId, body.connId, uid, body.to, body.data);
        break;
      case "force":
        hub.force(body.classId, body.connId, uid, body.target, body.what);
        break;
      case "close":
        hub.close(body.classId, body.connId, uid);
        break;
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof RoomError) return NextResponse.json({ error: e.code }, { status: 409 });
    if (e instanceof AccessDenied) return NextResponse.json({ error: "access.denied" }, { status: 403 });
    throw e;
  }
}
