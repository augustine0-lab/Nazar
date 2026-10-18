"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";

const KEY = "nazar_bn";
const enabled = () => {
  try {
    return localStorage.getItem(KEY) === "1" && typeof Notification !== "undefined" && Notification.permission === "granted";
  } catch {
    return false;
  }
};

/** Polls once a minute and shows new notifications on the device screen, only if the person turned this on. */
export function NotifyWatcher() {
  useEffect(() => {
    let since = Date.now();
    const tick = async () => {
      if (!enabled() || document.visibilityState === "hidden") return;
      try {
        const res = await fetch(`/api/notifications?since=${since}`, { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as { items: { id: string; text: string; href: string | null; at: number }[] };
        for (const n of data.items) {
          const note = new Notification("Nazar", { body: n.text, tag: n.id });
          note.onclick = () => {
            window.focus();
            if (n.href) window.location.href = n.href;
          };
          since = Math.max(since, n.at);
        }
      } catch {}
    };
    const timer = setInterval(tick, 60_000);
    return () => clearInterval(timer);
  }, []);
  return null;
}

/** Checkbox on the notifications page that asks the browser for permission. */
export function NotifyToggle() {
  const { t } = useI18n();
  const [supported, setSupported] = useState(true);
  const [on, setOn] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  useEffect(() => {
    setSupported(typeof Notification !== "undefined");
    setOn(enabled());
  }, []);

  async function change(next: boolean) {
    setMsg(null);
    if (!next) {
      try { localStorage.setItem(KEY, "0"); } catch {}
      return setOn(false);
    }
    const perm = await Notification.requestPermission();
    if (perm !== "granted") return setMsg(t("ntf.browserDenied"));
    try { localStorage.setItem(KEY, "1"); } catch {}
    setOn(true);
  }

  if (!supported) return <p className="muted small">{t("ntf.browserNone")}</p>;
  return (
    <div className="stack">
      <label className="check">
        <input type="checkbox" checked={on} onChange={(e) => change(e.target.checked)} />
        <span>{t("ntf.browser")}</span>
      </label>
      {msg && <p className="msg err" role="status">{msg}</p>}
    </div>
  );
}
