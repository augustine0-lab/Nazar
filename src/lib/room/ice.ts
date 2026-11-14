import "server-only";

/**
 * Servers that help two browsers find each other. Video never passes through a STUN server; it only tells a browser
 * its public network address. ROOM_ICE_SERVERS (JSON, the RTCIceServer format) replaces the default, for example
 * with the school's own STUN or a TURN server for networks that block direct connections.
 */
export function iceServers(): RTCIceServer[] {
  const raw = process.env.ROOM_ICE_SERVERS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as RTCIceServer[];
      if (Array.isArray(parsed)) return parsed;
    } catch {
      console.warn("ROOM_ICE_SERVERS is not valid JSON, using the default STUN server");
    }
  }
  return [{ urls: "stun:stun.l.google.com:19302" }];
}
