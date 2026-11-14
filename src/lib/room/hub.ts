// The live quiet rooms, kept only in the memory of the one Nazar server process.
// The server sees who is in a room, their status and the shared timer. It never sees video or sound:
// those go directly between browsers (WebRTC), the server only passes the short connection messages along.
// Nothing here is written to disk, so a restart empties every room.
import { ROOM_MAX_PEOPLE, ROOM_THUMB_WINDOW_MS, type RoomActivity } from "../domain/room";

export type RoomKind = "HOST" | "PUPIL";

/** Who may be in the room and on what terms: decided from the database each time someone connects or joins. */
export interface RoomEntry {
  userId: string;
  name: string;
  kind: RoomKind;
  studentId: string | null;
  /** The parent allowed the camera. */
  video: boolean;
  /** Every parent of the class agreed to a room without an adult. */
  freeAllowed: boolean;
}

export interface Conn {
  id: string;
  userId: string;
  studentId: string | null;
  send: (msg: object) => void;
  close: () => void;
}

interface Member {
  connId: string;
  entry: RoomEntry;
  cam: boolean;
  mic: boolean;
  activity: RoomActivity;
  since: number;
  thumbs: number;
}

interface Timer {
  minutes: number;
  startedAt: number;
  endsAt: number;
}

interface Room {
  conns: Map<string, Conn>;
  members: Map<string, Member>;
  freeAllowed: boolean;
  timer: Timer | null;
  /** "from>to" pairs of thumbs sent in the current round. */
  given: Set<string>;
  cancel: Array<() => void>;
}

export type RoomErrorCode =
  | "room.err.closed"
  | "room.err.full"
  | "room.err.notJoined"
  | "room.err.notHost"
  | "room.err.timerRunning"
  | "room.err.noThumbYet"
  | "room.err.thumbTwice"
  | "room.err.noPeer"
  | "room.err.noVideo"
  | "room.err.noMic";

export class RoomError extends Error {
  constructor(public code: RoomErrorCode) {
    super(code);
  }
}

export type CloseReason = "hostLeft" | "hostClosed" | "parentOff" | "replaced";

export interface MemberView {
  id: string;
  name: string;
  kind: RoomKind;
  cam: boolean;
  mic: boolean;
  activity: RoomActivity;
  since: number;
  thumbs: number;
}

export interface RoomSnapshot {
  type: "roster";
  now: number;
  /** Someone may come in: an adult is there, or every parent agreed to a room without one. */
  open: boolean;
  hosted: boolean;
  freeAllowed: boolean;
  timer: Timer | null;
  thumbsOpen: boolean;
  members: MemberView[];
  /** Members this reader already thanked in this round. */
  given: string[];
  me: string | null;
}

type Schedule = (fn: () => void, ms: number) => () => void;
const defaultSchedule: Schedule = (fn, ms) => {
  const t = setTimeout(fn, ms);
  (t as { unref?: () => void }).unref?.();
  return () => clearTimeout(t);
};

export class RoomHub {
  private rooms = new Map<string, Room>();

  constructor(
    private clock: () => number = () => Date.now(),
    private schedule: Schedule = defaultSchedule,
  ) {}

  private room(classId: string): Room {
    let r = this.rooms.get(classId);
    if (!r) {
      r = { conns: new Map(), members: new Map(), freeAllowed: false, timer: null, given: new Set(), cancel: [] };
      this.rooms.set(classId, r);
    }
    return r;
  }

  private hosted(r: Room) {
    return [...r.members.values()].some((m) => m.entry.kind === "HOST");
  }

  private thumbsOpen(r: Room) {
    const now = this.clock();
    return Boolean(r.timer && now >= r.timer.endsAt && now < r.timer.endsAt + ROOM_THUMB_WINDOW_MS);
  }

  private timerRunning(r: Room) {
    return Boolean(r.timer && this.clock() < r.timer.endsAt);
  }

  /** The caller's own connection; someone else's connection id is refused. */
  private own(classId: string, connId: string, userId: string) {
    const r = this.rooms.get(classId);
    const conn = r?.conns.get(connId);
    if (!r || !conn || conn.userId !== userId) throw new RoomError("room.err.notJoined");
    return { r, conn, member: r.members.get(connId) };
  }

  private joined(classId: string, connId: string, userId: string) {
    const x = this.own(classId, connId, userId);
    if (!x.member) throw new RoomError("room.err.notJoined");
    return { ...x, member: x.member };
  }

  snapshot(classId: string, forConn: string | null = null): RoomSnapshot {
    const r = this.room(classId);
    const hosted = this.hosted(r);
    const prefix = forConn ? `${forConn}>` : null;
    return {
      type: "roster",
      now: this.clock(),
      open: hosted || r.freeAllowed,
      hosted,
      freeAllowed: r.freeAllowed,
      timer: r.timer,
      thumbsOpen: this.thumbsOpen(r),
      members: [...r.members.values()].map((m) => ({
        id: m.connId,
        name: m.entry.name,
        kind: m.entry.kind,
        cam: m.cam,
        mic: m.mic,
        activity: m.activity,
        since: m.since,
        thumbs: m.thumbs,
      })),
      given: prefix ? [...r.given].filter((g) => g.startsWith(prefix)).map((g) => g.slice(prefix.length)) : [],
      me: forConn && r.members.has(forConn) ? forConn : null,
    };
  }

  private broadcast(classId: string) {
    const r = this.rooms.get(classId);
    if (!r) return;
    for (const c of r.conns.values()) c.send(this.snapshot(classId, c.id));
  }

  /** A browser opened the room page (it sees who is inside, but is not inside yet). */
  connect(classId: string, conn: Conn, freeAllowed: boolean) {
    const r = this.room(classId);
    r.freeAllowed = freeAllowed;
    r.conns.set(conn.id, conn);
    conn.send({ type: "hello", connId: conn.id });
    this.broadcast(classId);
  }

  disconnect(classId: string, connId: string) {
    const r = this.rooms.get(classId);
    if (!r) return;
    if (r.members.has(connId)) this.removeMember(classId, connId, null);
    r.conns.delete(connId);
    if (!r.conns.size) {
      r.cancel.forEach((c) => c());
      this.rooms.delete(classId);
    } else this.broadcast(classId);
  }

  join(classId: string, connId: string, entry: RoomEntry, activity: RoomActivity) {
    const { r, member } = this.own(classId, connId, entry.userId);
    r.freeAllowed = entry.freeAllowed;
    if (member) return { peers: [...r.members.keys()].filter((id) => id !== connId) };
    if (entry.kind === "PUPIL" && !this.hosted(r) && !r.freeAllowed) throw new RoomError("room.err.closed");
    // One place per person: a second tab takes the place of the first.
    for (const m of [...r.members.values()]) {
      if (m.entry.userId === entry.userId) this.removeMember(classId, m.connId, "replaced");
    }
    if (r.members.size >= ROOM_MAX_PEOPLE) throw new RoomError("room.err.full");
    r.members.set(connId, { connId, entry, cam: false, mic: false, activity, since: this.clock(), thumbs: 0 });
    this.broadcast(classId);
    // The newcomer calls everyone who is already there; they answer.
    return { peers: [...r.members.keys()].filter((id) => id !== connId) };
  }

  leave(classId: string, connId: string, userId: string) {
    const { member } = this.own(classId, connId, userId);
    if (member) this.removeMember(classId, connId, null);
  }

  private removeMember(classId: string, connId: string, reason: CloseReason | null) {
    const r = this.rooms.get(classId);
    const m = r?.members.get(connId);
    if (!r || !m) return;
    r.members.delete(connId);
    if (reason) r.conns.get(connId)?.send({ type: "closed", reason });
    // Without an adult the room stays open only when every parent agreed.
    if (m.entry.kind === "HOST" && !this.hosted(r)) {
      if (!r.freeAllowed) {
        for (const p of [...r.members.values()]) {
          r.members.delete(p.connId);
          r.conns.get(p.connId)?.send({ type: "closed", reason: "hostLeft" });
        }
        r.timer = null;
      } else this.muteAll(r);
    }
    this.broadcast(classId);
  }

  /** Microphones work only while an adult leads the room. */
  private muteAll(r: Room) {
    for (const m of r.members.values()) {
      if (m.mic) {
        m.mic = false;
        r.conns.get(m.connId)?.send({ type: "forced", what: "mic" });
      }
    }
  }

  update(classId: string, connId: string, userId: string, patch: { cam?: boolean; mic?: boolean; activity?: RoomActivity }) {
    const { r, member } = this.joined(classId, connId, userId);
    if (patch.cam && !member.entry.video) throw new RoomError("room.err.noVideo");
    if (patch.mic && !this.hosted(r)) throw new RoomError("room.err.noMic");
    if (patch.cam !== undefined) member.cam = patch.cam;
    if (patch.mic !== undefined) member.mic = patch.mic;
    if (patch.activity && patch.activity !== member.activity) {
      member.activity = patch.activity;
      member.since = this.clock();
    }
    this.broadcast(classId);
  }

  /** The adult starts the shared timer; in a room without an adult anyone may, when none is running. */
  startTimer(classId: string, connId: string, userId: string, minutes: number) {
    const { r, member } = this.joined(classId, connId, userId);
    if (this.hosted(r) && member.entry.kind !== "HOST") throw new RoomError("room.err.notHost");
    if (!this.hosted(r) && this.timerRunning(r)) throw new RoomError("room.err.timerRunning");
    r.cancel.forEach((c) => c());
    const now = this.clock();
    r.timer = { minutes, startedAt: now, endsAt: now + minutes * 60_000 };
    r.given.clear();
    for (const m of r.members.values()) m.thumbs = 0;
    // Everyone sees the round end and the thumbs close at the same moment.
    r.cancel = [
      this.schedule(() => this.broadcast(classId), minutes * 60_000),
      this.schedule(() => this.broadcast(classId), minutes * 60_000 + ROOM_THUMB_WINDOW_MS),
    ];
    this.broadcast(classId);
  }

  stopTimer(classId: string, connId: string, userId: string) {
    const { r, member } = this.joined(classId, connId, userId);
    if (member.entry.kind !== "HOST") throw new RoomError("room.err.notHost");
    r.cancel.forEach((c) => c());
    r.cancel = [];
    r.timer = null;
    this.broadcast(classId);
  }

  /** A thumb for someone after the round, once per person per round. Not a message: it carries nothing else. */
  thumb(classId: string, connId: string, userId: string, to: string) {
    const { r } = this.joined(classId, connId, userId);
    const target = r.members.get(to);
    if (!target || to === connId) throw new RoomError("room.err.noPeer");
    if (!this.thumbsOpen(r)) throw new RoomError("room.err.noThumbYet");
    const key = `${connId}>${to}`;
    if (r.given.has(key)) throw new RoomError("room.err.thumbTwice");
    r.given.add(key);
    target.thumbs += 1;
    for (const c of r.conns.values()) if (r.members.has(c.id)) c.send({ type: "thumb", from: connId, to });
    this.broadcast(classId);
  }

  /** Passes a WebRTC offer, answer or network candidate to one other person in the same room. */
  signal(classId: string, connId: string, userId: string, to: string, data: unknown) {
    const { r } = this.joined(classId, connId, userId);
    if (!r.members.has(to) || to === connId) throw new RoomError("room.err.noPeer");
    r.conns.get(to)?.send({ type: "signal", from: connId, data });
  }

  /** The adult turns off someone's camera or microphone. The child keeps the place in the room. */
  force(classId: string, connId: string, userId: string, target: string, what: "cam" | "mic") {
    const { r, member } = this.joined(classId, connId, userId);
    if (member.entry.kind !== "HOST") throw new RoomError("room.err.notHost");
    const m = r.members.get(target);
    if (!m) throw new RoomError("room.err.noPeer");
    m[what] = false;
    r.conns.get(target)?.send({ type: "forced", what });
    this.broadcast(classId);
  }

  /** The adult ends the session for everyone. */
  close(classId: string, connId: string, userId: string) {
    const { r, member } = this.joined(classId, connId, userId);
    if (member.entry.kind !== "HOST") throw new RoomError("room.err.notHost");
    for (const m of [...r.members.values()]) {
      r.members.delete(m.connId);
      if (m.connId !== connId) r.conns.get(m.connId)?.send({ type: "closed", reason: "hostClosed" });
    }
    r.cancel.forEach((c) => c());
    r.cancel = [];
    r.timer = null;
    this.broadcast(classId);
  }

  /** A parent changed their agreement to a room without an adult. */
  setFreeAllowed(classId: string, allowed: boolean) {
    const r = this.rooms.get(classId);
    if (!r) return;
    r.freeAllowed = allowed;
    if (!allowed && !this.hosted(r)) {
      for (const m of [...r.members.values()]) {
        r.members.delete(m.connId);
        r.conns.get(m.connId)?.send({ type: "closed", reason: "hostLeft" });
      }
      r.timer = null;
    }
    this.broadcast(classId);
  }

  /** A parent turned the room or the camera off: it takes effect at once, also in an open room. */
  applyParentChoice(studentId: string, choice: { enabled: boolean; video: boolean }) {
    for (const [classId, r] of this.rooms) {
      let changed = false;
      for (const conn of [...r.conns.values()]) {
        if (conn.studentId !== studentId) continue;
        const m = r.members.get(conn.id);
        if (!choice.enabled) {
          if (m) r.members.delete(conn.id);
          r.conns.delete(conn.id);
          conn.send({ type: "closed", reason: "parentOff" });
          conn.close();
          changed = true;
        } else if (m && !choice.video) {
          m.entry = { ...m.entry, video: false };
          if (m.cam) {
            m.cam = false;
            conn.send({ type: "forced", what: "cam" });
          }
          changed = true;
        } else if (m && choice.video) {
          m.entry = { ...m.entry, video: true };
          changed = true;
        }
      }
      if (changed) this.broadcast(classId);
    }
  }

  /** How many people are in each room now, for the class pages. */
  peopleIn(classId: string) {
    const r = this.rooms.get(classId);
    if (!r) return { pupils: 0, hosted: false };
    return { pupils: [...r.members.values()].filter((m) => m.entry.kind === "PUPIL").length, hosted: this.hosted(r) };
  }
}

// One hub per server process, shared by the route handlers and server actions (and kept across hot reloads in dev).
const g = globalThis as unknown as { __nazarRoomHub?: RoomHub };
export function roomHub(): RoomHub {
  g.__nazarRoomHub ??= new RoomHub();
  return g.__nazarRoomHub;
}
