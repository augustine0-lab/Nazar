"use client";

import { Emoji } from "@/components/ui/Emoji";
import { I } from "@/components/ui/Icon";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n";
import { ROOM_ACTIVITIES, ROOM_ACTIVITY_ICON, ROOM_DEMO_MINUTES, ROOM_TIMER_MINUTES, type RoomActivity } from "@/lib/domain/room";
import type { MemberView, RoomSnapshot } from "@/lib/room/hub";

/**
 * The quiet room in the browser. Video and sound go directly to the other browsers (WebRTC, one connection per person);
 * the Nazar server only passes the short messages that set those connections up, and the room list.
 * Camera and microphone are off until the person turns them on. Turning the camera off keeps the place in the room.
 */

interface Peer {
  pc: RTCPeerConnection;
  stream: MediaStream;
  queue: Promise<void>;
  pending: RTCIceCandidateInit[];
}

type Signal = { sdp?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
type ServerMsg =
  | { type: "hello"; connId: string }
  | RoomSnapshot
  | { type: "signal"; from: string; data: Signal }
  | { type: "thumb"; from: string; to: string }
  | { type: "forced"; what: "cam" | "mic" }
  | { type: "closed"; reason: "hostLeft" | "hostClosed" | "parentOff" | "replaced" };

const VIDEO: MediaTrackConstraints = { width: { ideal: 320 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 15 } };

/**
 * Blurs everything except the middle of the picture (the desk and hands), on this device, before anything is sent.
 * Works without extra libraries: the frame is drawn tiny and stretched back, then the sharp middle is drawn on top.
 */
function blurTrack(raw: MediaStreamTrack): { track: MediaStreamTrack; stop: () => void } {
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.srcObject = new MediaStream([raw]);
  void video.play().catch(() => undefined);
  const { width = 320, height = 240 } = raw.getSettings();
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const small = document.createElement("canvas");
  small.width = Math.max(8, Math.round(width / 24));
  small.height = Math.max(6, Math.round(height / 24));
  const ctx = canvas.getContext("2d")!;
  const sctx = small.getContext("2d")!;
  const draw = () => {
    if (video.readyState < 2) return;
    sctx.drawImage(video, 0, 0, small.width, small.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(small, 0, 0, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(width / 2, height * 0.58, width * 0.36, height * 0.38, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();
  };
  const timer = setInterval(draw, 1000 / 15);
  const track = canvas.captureStream(15).getVideoTracks()[0];
  return {
    track,
    stop: () => {
      clearInterval(timer);
      track.stop();
      video.srcObject = null;
    },
  };
}

function mmss(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function QuietRoom({ classId, kind, video, iceServers, demo = false }: { classId: string; kind: "HOST" | "PUPIL"; video: boolean; iceServers: RTCIceServer[]; demo?: boolean }) {
  const { t } = useI18n();
  const [snap, setSnap] = useState<RoomSnapshot | null>(null);
  const [joined, setJoined] = useState(false);
  const [activity, setActivity] = useState<RoomActivity>("math");
  const [cam, setCam] = useState(false);
  const [mic, setMic] = useState(false);
  const [blur, setBlur] = useState(true);
  const [sound, setSound] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [pops, setPops] = useState<{ key: number; to: string }[]>([]);
  const [, bump] = useState(0);
  const rerender = useCallback(() => bump((n) => n + 1), []);

  const connId = useRef<string | null>(null);
  const wantJoin = useRef(false);
  const offset = useRef(0);
  const peers = useRef(new Map<string, Peer>());
  const camRaw = useRef<MediaStream | null>(null);
  const camOut = useRef<MediaStreamTrack | null>(null);
  const blurStop = useRef<(() => void) | null>(null);
  const micTrack = useRef<MediaStreamTrack | null>(null);
  const localVideo = useRef<HTMLVideoElement | null>(null);
  const state = useRef({ activity, cam, mic, blur });
  state.current = { activity, cam, mic, blur };

  const post = useCallback(
    async (body: Record<string, unknown>) => {
      if (!connId.current) return { error: "room.err.notJoined" };
      try {
        const res = await fetch("/api/room", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ classId, connId: connId.current, ...body }),
        });
        const json = (await res.json().catch(() => ({}))) as { error?: string; peers?: string[] };
        return json;
      } catch {
        return { error: "room.connLost" };
      }
    },
    [classId],
  );
  const say = useCallback((res: { error?: string }) => {
    if (res.error) setError(t(res.error as MsgKey));
    return !res.error;
  }, [t]);

  /* ---------- local camera and microphone ---------- */

  const attachLocal = useCallback(() => {
    for (const p of peers.current.values()) {
      for (const tr of p.pc.getTransceivers()) {
        if (tr.currentDirection === "stopped") continue;
        const k = tr.receiver.track?.kind;
        void tr.sender.replaceTrack(k === "video" ? camOut.current : k === "audio" ? micTrack.current : null).catch(() => undefined);
      }
    }
    if (localVideo.current) localVideo.current.srcObject = camOut.current ? new MediaStream([camOut.current]) : null;
  }, []);

  const stopCam = useCallback(() => {
    blurStop.current?.();
    blurStop.current = null;
    camRaw.current?.getTracks().forEach((tr) => tr.stop());
    camRaw.current = null;
    camOut.current = null;
    attachLocal();
  }, [attachLocal]);

  const startCam = useCallback(async (withBlur: boolean) => {
    stopCam();
    const raw = await navigator.mediaDevices.getUserMedia({ video: VIDEO, audio: false });
    camRaw.current = raw;
    const track = raw.getVideoTracks()[0];
    if (withBlur) {
      const b = blurTrack(track);
      camOut.current = b.track;
      blurStop.current = b.stop;
    } else camOut.current = track;
    attachLocal();
  }, [attachLocal, stopCam]);

  const stopMic = useCallback(() => {
    micTrack.current?.stop();
    micTrack.current = null;
    attachLocal();
  }, [attachLocal]);

  /* ---------- connections to the other people ---------- */

  const dropPeer = useCallback((id: string) => {
    const p = peers.current.get(id);
    if (!p) return;
    p.pc.close();
    peers.current.delete(id);
  }, []);

  const dropAll = useCallback(() => {
    for (const id of [...peers.current.keys()]) dropPeer(id);
    rerender();
  }, [dropPeer, rerender]);

  const makePeer = useCallback(
    (id: string) => {
      const pc = new RTCPeerConnection({ iceServers });
      const peer: Peer = { pc, stream: new MediaStream(), queue: Promise.resolve(), pending: [] };
      pc.ontrack = (e) => {
        peer.stream.addTrack(e.track);
        rerender();
      };
      pc.onicecandidate = (e) => {
        if (e.candidate) void post({ type: "signal", to: id, data: { candidate: e.candidate.toJSON() } });
      };
      pc.onconnectionstatechange = rerender;
      peers.current.set(id, peer);
      return peer;
    },
    [iceServers, post, rerender],
  );

  const callPeer = useCallback(
    async (id: string) => {
      const peer = makePeer(id);
      const audio = peer.pc.addTransceiver("audio", { direction: "sendrecv" });
      const vid = peer.pc.addTransceiver("video", { direction: "sendrecv" });
      await audio.sender.replaceTrack(micTrack.current);
      await vid.sender.replaceTrack(camOut.current);
      const offer = await peer.pc.createOffer();
      await peer.pc.setLocalDescription(offer);
      await post({ type: "signal", to: id, data: { sdp: { type: offer.type, sdp: offer.sdp } } });
    },
    [makePeer, post],
  );

  const onSignal = useCallback(
    (from: string, data: Signal) => {
      let peer = peers.current.get(from);
      if (!peer) {
        if (data.sdp?.type !== "offer") return;
        peer = makePeer(from);
      }
      const p = peer;
      p.queue = p.queue
        .then(async () => {
          if (data.sdp) {
            await p.pc.setRemoteDescription(data.sdp);
            if (data.sdp.type === "offer") {
              for (const tr of p.pc.getTransceivers()) tr.direction = "sendrecv";
              attachLocal();
              const answer = await p.pc.createAnswer();
              await p.pc.setLocalDescription(answer);
              await post({ type: "signal", to: from, data: { sdp: { type: answer.type, sdp: answer.sdp } } });
            }
            for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => undefined);
          } else if (data.candidate) {
            if (p.pc.remoteDescription) await p.pc.addIceCandidate(data.candidate).catch(() => undefined);
            else p.pending.push(data.candidate);
          }
        })
        .catch(() => undefined);
    },
    [attachLocal, makePeer, post],
  );

  /* ---------- entering and leaving ---------- */

  const leaveLocal = useCallback(() => {
    wantJoin.current = false;
    setJoined(false);
    setCam(false);
    setMic(false);
    stopCam();
    stopMic();
    dropAll();
  }, [dropAll, stopCam, stopMic]);

  const join = useCallback(async () => {
    setError(null);
    setNotice(null);
    setBusy(true);
    const res = await post({ type: "join", activity: state.current.activity });
    setBusy(false);
    if (!say(res)) return;
    wantJoin.current = true;
    setJoined(true);
    // After a lost connection the camera may still be on: tell the room again.
    if (state.current.cam) void post({ type: "state", cam: true });
    for (const id of res.peers ?? []) void callPeer(id).catch(() => undefined);
  }, [callPeer, post, say]);

  const leave = useCallback(async () => {
    leaveLocal();
    await post({ type: "leave" });
  }, [leaveLocal, post]);

  /* ---------- the live stream from the server ---------- */

  const handle = useRef<(m: ServerMsg) => void>(() => undefined);
  handle.current = (m: ServerMsg) => {
    switch (m.type) {
      case "hello":
        connId.current = m.connId;
        setLost(false);
        if (wantJoin.current) {
          dropAll();
          void join();
        }
        break;
      case "roster": {
        offset.current = m.now - Date.now();
        setSnap(m);
        const ids = new Set(m.members.map((x) => x.id));
        for (const id of [...peers.current.keys()]) if (!ids.has(id)) dropPeer(id);
        break;
      }
      case "signal":
        onSignal(m.from, m.data);
        break;
      case "thumb":
        setPops((p) => [...p, { key: Date.now() + Math.random(), to: m.to }]);
        break;
      case "forced":
        if (m.what === "cam") {
          setCam(false);
          stopCam();
          setNotice(t("room.forced.cam"));
        } else {
          setMic(false);
          stopMic();
          setNotice(t("room.forced.mic"));
        }
        break;
      case "closed":
        leaveLocal();
        setNotice(t(`room.closed.${m.reason}` as MsgKey));
        break;
    }
  };

  useEffect(() => {
    const es = new EventSource(`/api/room/events?class=${encodeURIComponent(classId)}`);
    es.onmessage = (e) => {
      try {
        handle.current(JSON.parse(e.data) as ServerMsg);
      } catch {
        /* ignore a broken message */
      }
    };
    es.onerror = () => setLost(true);
    const peersNow = peers.current;
    return () => {
      es.close();
      for (const p of peersNow.values()) p.pc.close();
      peersNow.clear();
      blurStop.current?.();
      camRaw.current?.getTracks().forEach((tr) => tr.stop());
      micTrack.current?.stop();
    };
  }, [classId]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!pops.length) return;
    const id = setTimeout(() => setPops((p) => p.slice(1)), 1800);
    return () => clearTimeout(id);
  }, [pops]);

  /* ---------- controls ---------- */

  const toggleCam = async () => {
    setError(null);
    if (cam) {
      setCam(false);
      stopCam();
      await post({ type: "state", cam: false });
      return;
    }
    try {
      await startCam(blur);
    } catch {
      setError(t("room.cam.error"));
      return;
    }
    if (say(await post({ type: "state", cam: true }))) setCam(true);
    else stopCam();
  };

  const toggleBlur = async () => {
    const next = !blur;
    setBlur(next);
    if (cam) await startCam(next).catch(() => setError(t("room.cam.error")));
  };

  const toggleMic = async () => {
    setError(null);
    if (mic) {
      setMic(false);
      stopMic();
      await post({ type: "state", mic: false });
      return;
    }
    try {
      const s = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      micTrack.current = s.getAudioTracks()[0];
    } catch {
      setError(t("room.cam.error"));
      return;
    }
    if (say(await post({ type: "state", mic: true }))) {
      setMic(true);
      attachLocal();
    } else stopMic();
  };

  const changeActivity = async (a: RoomActivity) => {
    setActivity(a);
    if (joined) await post({ type: "state", activity: a });
  };

  /* ---------- view ---------- */

  const serverNow = now + offset.current;
  const me = snap?.me ?? null;
  const members = useMemo(() => {
    const list = snap?.members ?? [];
    const rank = (m: MemberView) => (m.id === me ? 0 : m.kind === "HOST" ? 1 : 2);
    return [...list].sort((a, b) => rank(a) - rank(b) || a.since - b.since);
  }, [snap, me]);
  const pupils = members.filter((m) => m.kind === "PUPIL");
  const timer = snap?.timer ?? null;
  const running = Boolean(timer && serverNow < timer.endsAt);
  const imHost = kind === "HOST";
  const canStart = joined && (imHost || (!snap?.hosted && !running));
  const actLabel = (a: RoomActivity) => `${ROOM_ACTIVITY_ICON[a]} ${t(`room.act.${a}` as MsgKey)}`;
  const minutes = (since: number) => t("room.min", { n: Math.max(0, Math.floor((serverNow - since) / 60_000)) });

  return (
    <div className="stack room" style={{ gap: 16 }}>
      {lost && <p className="msg" role="status" style={{ background: "var(--star-soft)" }}>{t("room.connLost")}</p>}
      {notice && <p className="msg ok" role="status">{notice}</p>}
      {error && <p className="msg err" role="alert">{error}</p>}

      <section className="card room-timer" aria-live="polite">
        <div className="row between">
          <h2>{t("room.timer.title")}</h2>
          {snap && <span className="pill">{snap.hosted ? t("room.hostedNote") : snap.freeAllowed ? t("room.freeNote") : t("room.closedPupil")}</span>}
        </div>
        {timer && running ? (
          <>
            <div className="row between">
              <span className="big num">{mmss(timer.endsAt - serverNow)}</span>
              <span className="muted">{t("room.timer.left", { time: mmss(timer.endsAt - serverNow) })}</span>
            </div>
            <div className="bar"><i style={{ width: `${Math.min(100, ((serverNow - timer.startedAt) / (timer.endsAt - timer.startedAt)) * 100)}%` }} /></div>
          </>
        ) : snap?.thumbsOpen ? (
          <p className="room-done">{t("room.timer.done")}</p>
        ) : (
          <p className="muted">{t("room.timer.none")}</p>
        )}
        {joined && (
          <div className="row">
            {canStart && (
              <>
                <span className="muted small">{t("room.timer.startLabel")}</span>
                {(demo ? [ROOM_DEMO_MINUTES, ...ROOM_TIMER_MINUTES] : ROOM_TIMER_MINUTES).map((n) => (
                  <button key={n} type="button" className="chip" onClick={async () => say(await post({ type: "timer", minutes: n }))}>
                    {t("room.min", { n })}
                  </button>
                ))}
              </>
            )}
            {imHost && running && (
              <button type="button" className="btn quiet" onClick={async () => say(await post({ type: "stopTimer" }))}>{t("room.timer.stop")}</button>
            )}
            {!canStart && !imHost && snap?.hosted && <span className="muted small">{t("room.timer.waitHost")}</span>}
          </div>
        )}
      </section>

      {!joined ? (
        <section className="card">
          <p className="muted">{pupils.length ? t("room.inside", { n: pupils.length }) : t("room.empty")}</p>
          {pupils.length > 0 && (
            <ul className="room-who">
              {pupils.map((m) => (
                <li key={m.id}><b>{m.name}</b> · {actLabel(m.activity)} · <span className="num">{minutes(m.since)}</span></li>
              ))}
            </ul>
          )}
          {kind === "PUPIL" && (
            <fieldset className="room-acts">
              <legend>{t("room.pick")}</legend>
              {ROOM_ACTIVITIES.map((a) => (
                <label key={a} className={`chip ${activity === a ? "on" : ""}`}>
                  <input type="radio" name="activity" value={a} checked={activity === a} onChange={() => setActivity(a)} className="sr-only" />
                  {actLabel(a)}
                </label>
              ))}
            </fieldset>
          )}
          <div className="row">
            <button
              type="button"
              className="btn primary"
              disabled={busy || !snap || (kind === "PUPIL" && !snap.open)}
              onClick={() => void join()}
            >
              {imHost ? t("room.openHost") : t("room.enter")}
            </button>
            {kind === "PUPIL" && snap && !snap.open && <span className="muted small">{t("room.closedPupil")}</span>}
          </div>
          {kind === "PUPIL" && <p className="muted small">{video ? t("room.cam.tip") : t("room.cam.noVideo")}</p>}
        </section>
      ) : (
        <>
          <section className="card room-controls">
            <div className="row">
              {kind === "PUPIL" && (
                <label className="room-act-select">
                  <span className="sr-only">{t("room.pick")}</span>
                  <select value={activity} onChange={(e) => void changeActivity(e.target.value as RoomActivity)}>
                    {ROOM_ACTIVITIES.map((a) => <option key={a} value={a}>{actLabel(a)}</option>)}
                  </select>
                </label>
              )}
              <button type="button" className={`btn ${cam ? "" : "primary"}`} onClick={() => void toggleCam()} disabled={!video} aria-pressed={cam}>
                <I name="camera" /> {cam ? t("room.cam.off") : t("room.cam.on")}
              </button>
              <label className="room-check">
                <input type="checkbox" checked={blur} onChange={() => void toggleBlur()} disabled={!video} />
                {t("room.blur")}
              </label>
              <button type="button" className="btn" onClick={() => void toggleMic()} disabled={!snap?.hosted && !mic} aria-pressed={mic}>
                <I name="mic" /> {mic ? t("room.mic.off") : t("room.mic.on")}
              </button>
              <button type="button" className="btn" onClick={() => setSound((s) => !s)} aria-pressed={sound}>
                <I name={sound ? "speak" : "mute"} /> {sound ? t("room.sound.off") : t("room.sound.on")}
              </button>
              <button type="button" className="btn quiet" onClick={() => void leave()}>{t("room.leave")}</button>
              {imHost && (
                <button type="button" className="btn danger" onClick={async () => { if (say(await post({ type: "close" }))) leaveLocal(); }}>
                  {t("room.closeAll")}
                </button>
              )}
            </div>
            <p className="muted small">
              {!video ? t("room.cam.noVideo") : blur ? t("room.blurHint") : t("room.cam.tip")} {!snap?.hosted ? t("room.mic.onlyHost") : t("room.sound.hint")}
            </p>
          </section>

          <section className="room-grid" aria-label={t("room.inside", { n: members.length })}>
            {members.map((m) => {
              const mine = m.id === me;
              const peer = peers.current.get(m.id);
              const pstate = peer?.pc.connectionState;
              const showVideo = m.cam && (mine ? Boolean(camOut.current) : Boolean(peer && pstate === "connected"));
              return (
                <article key={m.id} className={`room-tile ${m.kind === "HOST" ? "host" : ""} ${mine ? "mine" : ""}`}>
                  <div className="room-screen">
                    {mine ? (
                      <video
                        ref={(el) => {
                          localVideo.current = el;
                          if (el && camOut.current && (el.srcObject as MediaStream | null)?.getVideoTracks()[0] !== camOut.current) el.srcObject = new MediaStream([camOut.current]);
                        }}
                        autoPlay
                        playsInline
                        muted
                        style={{ display: showVideo ? "block" : "none" }} />
                    ) : (
                      peer && <RemoteVideo stream={peer.stream} muted={!sound} hidden={!showVideo} />
                    )}
                    {!showVideo && (
                      <div className="room-avatar" aria-hidden="true">
                        <span className="room-initial">{m.name.slice(0, 1)}</span>
                        <span className="room-icon"><Emoji e={m.kind === "HOST" ? "🧑‍🏫" : ROOM_ACTIVITY_ICON[m.activity]} /></span>
                      </div>
                    )}
                    {!mine && m.cam && !showVideo && (
                      <span className="room-net small">{pstate === "failed" || pstate === "disconnected" ? t("room.peerFail") : t("room.peerWait")}</span>
                    )}
                    {pops.filter((p) => p.to === m.id).map((p) => <span key={p.key} className="room-pop" aria-hidden="true">👍</span>)}
                  </div>
                  <div className="room-caption">
                    <span>
                      <b>{m.name}</b>
                      {mine && <span className="muted"> ({t("room.you")})</span>}
                    </span>
                    <span className="small muted">
                      {m.kind === "HOST" ? t("room.watching") : <>{actLabel(m.activity)} · <span className="num">{minutes(m.since)}</span></>}
                      {!m.cam && <> · {t("room.camOff")}</>}
                      {m.mic && <> · 🎙️</>}
                    </span>
                  </div>
                  <div className="row room-tile-actions">
                    {m.thumbs > 0 && <span className="pill star" aria-label={t("room.thumbsGot", { n: m.thumbs })}>👍 {m.thumbs}</span>}
                    {!mine && snap?.thumbsOpen && (
                      snap.given.includes(m.id) ? (
                        <span className="pill good">{t("room.thumbSent")}</span>
                      ) : (
                        <button type="button" className="chip" aria-label={t("room.thumb", { name: m.name })} onClick={async () => say(await post({ type: "thumb", to: m.id }))}>👍</button>
                      )
                    )}
                    {imHost && !mine && m.cam && (
                      <button type="button" className="chip" aria-label={t("room.forceCam", { name: m.name })} title={t("room.forceCam", { name: m.name })} onClick={async () => say(await post({ type: "force", target: m.id, what: "cam" }))}>📷✕</button>
                    )}
                    {imHost && !mine && m.mic && (
                      <button type="button" className="chip" aria-label={t("room.forceMic", { name: m.name })} title={t("room.forceMic", { name: m.name })} onClick={async () => say(await post({ type: "force", target: m.id, what: "mic" }))}>🎙️✕</button>
                    )}
                  </div>
                </article>
              );
            })}
          </section>
        </>
      )}
    </div>
  );
}

function RemoteVideo({ stream, muted, hidden }: { stream: MediaStream; muted: boolean; hidden: boolean }) {
  const ref = useRef<HTMLVideoElement | null>(null);
  useEffect(() => {
    if (ref.current && ref.current.srcObject !== stream) ref.current.srcObject = stream;
  }, [stream]);
  useEffect(() => {
    if (ref.current) ref.current.muted = muted;
  }, [muted]);
  // Hidden video still plays, so the sound of an adult who speaks with the camera off is heard.
  return <video ref={ref} autoPlay playsInline muted={muted} style={{ display: hidden ? "none" : "block" }} />;
}
