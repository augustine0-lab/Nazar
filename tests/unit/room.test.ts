import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openDb, type DB } from "@/db";
import * as s from "@/db/schema";
import { seed } from "@/db/seed";
import type { Actor } from "@/lib/access";
import * as S from "@/lib/services";
import * as Q from "@/lib/room-services";
import * as D from "@/lib/domain";
import { RoomHub, type RoomEntry } from "@/lib/room/hub";

/* ---------- the live room, without a server ---------- */

const CLASS = "class-1";
type Sent = { type: string; [k: string]: unknown };

function setup() {
  let now = 1_000_000;
  const timers: { at: number; fn: () => void }[] = [];
  const hub = new RoomHub(
    () => now,
    (fn, ms) => {
      const t = { at: now + ms, fn };
      timers.push(t);
      return () => timers.splice(timers.indexOf(t), 1);
    },
  );
  const inbox = new Map<string, Sent[]>();
  const connect = (id: string, userId: string, freeAllowed = false, studentId: string | null = null) => {
    inbox.set(id, []);
    hub.connect(CLASS, { id, userId, studentId, send: (m) => inbox.get(id)!.push(m as Sent), close: () => undefined }, freeAllowed);
  };
  const entry = (userId: string, kind: RoomEntry["kind"], extra: Partial<RoomEntry> = {}): RoomEntry => ({
    userId,
    name: userId,
    kind,
    studentId: kind === "PUPIL" ? `s-${userId}` : null,
    video: true,
    freeAllowed: false,
    ...extra,
  });
  const last = (id: string, type: string) => [...inbox.get(id)!].reverse().find((m) => m.type === type);
  const advance = (ms: number) => {
    now += ms;
    for (const t of timers.filter((x) => x.at <= now)) t.fn();
  };
  return { hub, connect, entry, inbox, last, advance };
}

describe("quiet room hub", () => {
  it("keeps pupils out until an adult opens the room, unless every parent agreed", () => {
    const { hub, connect, entry } = setup();
    connect("c1", "miras", false, "s-miras");
    expect(() => hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math")).toThrow("room.err.closed");

    connect("h1", "aigul");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    const res = hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math");
    expect(res.peers).toEqual(["h1"]);

    const free = setup();
    free.connect("c1", "miras", true);
    expect(free.hub.join(CLASS, "c1", free.entry("miras", "PUPIL", { freeAllowed: true }), "math").peers).toEqual([]);
  });

  it("closes the room for pupils when the adult leaves a room that needs one", () => {
    const { hub, connect, entry, last } = setup();
    connect("h1", "aigul");
    connect("c1", "miras");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math");
    hub.leave(CLASS, "h1", "aigul");
    expect(last("c1", "closed")).toEqual({ type: "closed", reason: "hostLeft" });
    expect(hub.snapshot(CLASS).members).toHaveLength(0);
  });

  it("turns microphones off when a free room loses its adult", () => {
    const { hub, connect, entry, last } = setup();
    connect("h1", "aigul", true);
    connect("c1", "miras", true);
    hub.join(CLASS, "h1", entry("aigul", "HOST", { freeAllowed: true }), "other");
    hub.join(CLASS, "c1", entry("miras", "PUPIL", { freeAllowed: true }), "math");
    hub.update(CLASS, "c1", "miras", { mic: true });
    hub.leave(CLASS, "h1", "aigul");
    expect(last("c1", "forced")).toEqual({ type: "forced", what: "mic" });
    expect(hub.snapshot(CLASS).members[0]).toMatchObject({ id: "c1", mic: false });
    expect(() => hub.update(CLASS, "c1", "miras", { mic: true })).toThrow("room.err.noMic");
  });

  it("refuses the camera when the parent allowed the room without it, and keeps the place when it goes off", () => {
    const { hub, connect, entry } = setup();
    connect("h1", "aigul");
    connect("c1", "miras");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    hub.join(CLASS, "c1", entry("miras", "PUPIL", { video: false }), "math");
    expect(() => hub.update(CLASS, "c1", "miras", { cam: true })).toThrow("room.err.noVideo");
    hub.update(CLASS, "c1", "miras", { cam: false });
    expect(hub.snapshot(CLASS).members.map((m) => m.id)).toContain("c1");
  });

  it("lets nobody act through another person's connection", () => {
    const { hub, connect, entry } = setup();
    connect("h1", "aigul");
    connect("c1", "miras");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    expect(() => hub.join(CLASS, "c1", entry("aliya", "PUPIL"), "math")).toThrow("room.err.notJoined");
    hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math");
    expect(() => hub.close(CLASS, "h1", "miras")).toThrow("room.err.notJoined");
    expect(() => hub.close(CLASS, "c1", "miras")).toThrow("room.err.notHost");
  });

  it("passes connection messages only between people inside the same room", () => {
    const { hub, connect, entry, last } = setup();
    connect("h1", "aigul");
    connect("c1", "miras");
    connect("c2", "aliya");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math");
    hub.signal(CLASS, "c1", "miras", "h1", { sdp: { type: "offer", sdp: "x" } });
    expect(last("h1", "signal")).toEqual({ type: "signal", from: "c1", data: { sdp: { type: "offer", sdp: "x" } } });
    // c2 only watches the lobby: nobody can send it video offers.
    expect(() => hub.signal(CLASS, "c1", "miras", "c2", {})).toThrow("room.err.noPeer");
  });

  it("opens thumbs only after the shared timer ends, one per person per round", () => {
    const { hub, connect, entry, advance } = setup();
    connect("h1", "aigul");
    connect("c1", "miras");
    connect("c2", "aliya");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math");
    hub.join(CLASS, "c2", entry("aliya", "PUPIL"), "reading");
    expect(() => hub.startTimer(CLASS, "c1", "miras", 10)).toThrow("room.err.notHost");
    hub.startTimer(CLASS, "h1", "aigul", 10);
    expect(() => hub.thumb(CLASS, "c1", "miras", "c2")).toThrow("room.err.noThumbYet");
    advance(10 * 60_000);
    expect(hub.snapshot(CLASS).thumbsOpen).toBe(true);
    hub.thumb(CLASS, "c1", "miras", "c2");
    expect(() => hub.thumb(CLASS, "c1", "miras", "c2")).toThrow("room.err.thumbTwice");
    expect(() => hub.thumb(CLASS, "c1", "miras", "c1")).toThrow("room.err.noPeer");
    expect(hub.snapshot(CLASS, "c1").given).toEqual(["c2"]);
    expect(hub.snapshot(CLASS).members.find((m) => m.id === "c2")!.thumbs).toBe(1);
    advance(D.ROOM_THUMB_WINDOW_MS);
    expect(hub.snapshot(CLASS).thumbsOpen).toBe(false);
  });

  it("lets anyone start the timer in a free room, but not over a running one", () => {
    const { hub, connect, entry } = setup();
    connect("c1", "miras", true);
    connect("c2", "aliya", true);
    hub.join(CLASS, "c1", entry("miras", "PUPIL", { freeAllowed: true }), "math");
    hub.join(CLASS, "c2", entry("aliya", "PUPIL", { freeAllowed: true }), "math");
    hub.startTimer(CLASS, "c1", "miras", 15);
    expect(() => hub.startTimer(CLASS, "c2", "aliya", 10)).toThrow("room.err.timerRunning");
  });

  it("lets the adult turn off a child's camera without taking the place", () => {
    const { hub, connect, entry, last } = setup();
    connect("h1", "aigul");
    connect("c1", "miras");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math");
    hub.update(CLASS, "c1", "miras", { cam: true });
    hub.force(CLASS, "h1", "aigul", "c1", "cam");
    expect(last("c1", "forced")).toEqual({ type: "forced", what: "cam" });
    expect(hub.snapshot(CLASS).members.find((m) => m.id === "c1")).toMatchObject({ cam: false });
  });

  it("applies a parent's choice at once: camera off, or out of the room", () => {
    const { hub, connect, entry, last } = setup();
    connect("h1", "aigul");
    connect("c1", "miras", false, "s-miras");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math");
    hub.update(CLASS, "c1", "miras", { cam: true });
    hub.applyParentChoice("s-miras", { enabled: true, video: false });
    expect(last("c1", "forced")).toEqual({ type: "forced", what: "cam" });
    expect(() => hub.update(CLASS, "c1", "miras", { cam: true })).toThrow("room.err.noVideo");
    hub.applyParentChoice("s-miras", { enabled: false, video: false });
    expect(last("c1", "closed")).toEqual({ type: "closed", reason: "parentOff" });
    expect(hub.snapshot(CLASS).members.map((m) => m.id)).toEqual(["h1"]);
  });

  it("closes a free room when a parent takes back the agreement", () => {
    const { hub, connect, entry, last } = setup();
    connect("c1", "miras", true);
    hub.join(CLASS, "c1", entry("miras", "PUPIL", { freeAllowed: true }), "math");
    hub.setFreeAllowed(CLASS, false);
    expect(last("c1", "closed")).toEqual({ type: "closed", reason: "hostLeft" });
    expect(hub.snapshot(CLASS).open).toBe(false);
  });

  it("gives a person one place: a second tab replaces the first", () => {
    const { hub, connect, entry, last } = setup();
    connect("h1", "aigul");
    connect("c1", "miras");
    connect("c1b", "miras");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    hub.join(CLASS, "c1", entry("miras", "PUPIL"), "math");
    hub.join(CLASS, "c1b", entry("miras", "PUPIL"), "math");
    expect(last("c1", "closed")).toEqual({ type: "closed", reason: "replaced" });
    expect(hub.snapshot(CLASS).members.map((m) => m.id).sort()).toEqual(["c1b", "h1"]);
  });

  it("limits the room size", () => {
    const { hub, connect, entry } = setup();
    connect("h1", "aigul");
    hub.join(CLASS, "h1", entry("aigul", "HOST"), "other");
    for (let i = 1; i < D.ROOM_MAX_PEOPLE; i++) {
      connect(`c${i}`, `kid${i}`);
      hub.join(CLASS, `c${i}`, entry(`kid${i}`, "PUPIL"), "math");
    }
    connect("late", "late");
    expect(() => hub.join(CLASS, "late", entry("late", "PUPIL"), "math")).toThrow("room.err.full");
  });
});

/* ---------- who may enter, from the database ---------- */

let db: DB;
const actorByLogin = (login: string): Actor => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return { id: u.id, role: u.role, schoolId: u.schoolId };
};
const studentByLogin = (login: string) => {
  const u = db.select().from(s.users).where(eq(s.users.login, login)).get()!;
  return db.select().from(s.students).where(eq(s.students.userId, u.id)).get()!;
};

describe("quiet room access", () => {
  beforeEach(() => {
    db = openDb(":memory:");
    migrate(db, { migrationsFolder: "./drizzle" });
    seed(db, S.today());
  });

  it("needs every parent of the class for a room without an adult", async () => {
    const miras = studentByLogin("miras");
    expect(await Q.classRoomRule(db, miras.classId)).toEqual({ pupils: 2, enabled: 2, unsupervised: 1 });
    const res = await Q.setRoomChoice(db, actorByLogin("erlan"), { studentId: studentByLogin("aliya").id, enabled: true, video: true, unsupervised: true });
    expect(res.freeAllowed).toBe(true);
    const off = await Q.setRoomChoice(db, actorByLogin("gulnar"), { studentId: miras.id, enabled: false, video: true, unsupervised: true });
    // Turning the room off also takes back the camera and the agreement.
    expect(off.choice).toEqual({ enabled: false, video: false, unsupervised: false });
    expect(off.freeAllowed).toBe(false);
  });

  it("gives a pupil only their own class, and only when a parent turned the room on", async () => {
    const miras = studentByLogin("miras");
    const sanzhar = studentByLogin("sanzhar");
    const access = await Q.roomAccess(db, actorByLogin("miras"), sanzhar.classId);
    expect(access).toMatchObject({ ok: true, classId: miras.classId, entry: { kind: "PUPIL", name: "Мирас", video: true } });
    expect(await Q.roomAccess(db, actorByLogin("sanzhar"))).toMatchObject({ ok: false, reason: "noConsent" });
    await Q.setRoomChoice(db, actorByLogin("gulnar"), { studentId: miras.id, enabled: false, video: false, unsupervised: false });
    expect(await Q.roomAccess(db, actorByLogin("miras"))).toMatchObject({ ok: false, reason: "parentOff" });
  });

  it("lets only the class teacher and the children's psychologist lead the room", async () => {
    const cls = studentByLogin("miras").classId;
    expect(await Q.roomAccess(db, actorByLogin("aigul"), cls)).toMatchObject({ ok: true, entry: { kind: "HOST" } });
    expect(await Q.roomAccess(db, actorByLogin("saule"), cls)).toMatchObject({ ok: true, entry: { kind: "HOST" } });
    await expect(Q.roomAccess(db, actorByLogin("nurlan"), cls)).rejects.toThrow();
    await expect(Q.roomAccess(db, actorByLogin("admin"), cls)).rejects.toThrow();
    await expect(Q.roomAccess(db, actorByLogin("gulnar"), cls)).rejects.toThrow();
  });

  it("lets only the child's own parent change the switch", async () => {
    const miras = studentByLogin("miras");
    await expect(Q.setRoomChoice(db, actorByLogin("erlan"), { studentId: miras.id, enabled: true, video: true, unsupervised: true })).rejects.toThrow();
    await expect(Q.setRoomChoice(db, actorByLogin("aigul"), { studentId: miras.id, enabled: true, video: true, unsupervised: true })).rejects.toThrow();
    // Without consent nothing can be turned on.
    await expect(Q.setRoomChoice(db, actorByLogin("dana"), { studentId: studentByLogin("sanzhar").id, enabled: true, video: true, unsupervised: true })).rejects.toThrow();
  });
});
