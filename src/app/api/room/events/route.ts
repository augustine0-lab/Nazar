import { getDb } from "@/db";
import { AccessDenied } from "@/lib/access";
import { roomAccess } from "@/lib/room-services";
import { roomHub } from "@/lib/room/hub";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PING_MS = 20_000;

/**
 * The room's live stream (server-sent events): who is inside, the timer, and connection messages for this browser.
 * Video never passes here. The stream ends when the page is closed, and the person leaves the room then.
 */
export async function GET(req: Request) {
  const user = await currentUser();
  if (!user) return new Response("unauthorized", { status: 401 });
  let access;
  try {
    access = await roomAccess(getDb(), { id: user.id, role: user.role, schoolId: user.schoolId }, new URL(req.url).searchParams.get("class") ?? undefined);
  } catch (e) {
    if (e instanceof AccessDenied) return new Response("forbidden", { status: 403 });
    throw e;
  }
  if (!access.ok) return new Response("forbidden", { status: 403 });
  const { classId, entry } = access;
  const hub = roomHub();
  const connId = crypto.randomUUID();
  const enc = new TextEncoder();
  let ping: ReturnType<typeof setInterval> | undefined;
  let done = false;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const write = (chunk: string) => {
        if (done) return;
        try {
          controller.enqueue(enc.encode(chunk));
        } catch {
          finish();
        }
      };
      const finish = () => {
        if (done) return;
        done = true;
        clearInterval(ping);
        hub.disconnect(classId, connId);
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      };
      req.signal.addEventListener("abort", finish);
      ping = setInterval(() => write(": ping\n\n"), PING_MS);
      write("retry: 3000\n\n");
      hub.connect(classId, { id: connId, userId: user.id, studentId: entry.studentId, send: (msg) => write(`data: ${JSON.stringify(msg)}\n\n`), close: finish }, entry.freeAllowed);
    },
    cancel() {
      if (done) return;
      done = true;
      clearInterval(ping);
      hub.disconnect(classId, connId);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      // no-transform keeps the response from being compressed and held back in a buffer.
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
