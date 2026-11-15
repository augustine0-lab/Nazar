"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import { captureInstallPrompt } from "./install-store";

let started = false;

/**
 * Turns Nazar into an installable app: registers the service worker (on the built site only, so that development
 * reloads stay plain) and tells the reader when the connection drops, because a form sent offline is not saved.
 */
export function Pwa() {
  const { t } = useI18n();
  const [net, setNet] = useState<"on" | "off" | "back">("on");

  useEffect(() => {
    if (!started) {
      started = true;
      captureInstallPrompt();
      if ("serviceWorker" in navigator && (process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_SW === "on")) {
        navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
      }
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const off = () => {
      clearTimeout(timer);
      setNet("off");
    };
    const on = () => {
      setNet((was) => (was === "off" ? "back" : "on"));
      timer = setTimeout(() => setNet("on"), 3000);
    };
    if (!navigator.onLine) off();
    window.addEventListener("offline", off);
    window.addEventListener("online", on);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("offline", off);
      window.removeEventListener("online", on);
    };
  }, []);

  return (
    <div className={`net-note${net === "back" ? " back" : ""}`} role="status" aria-live="polite" data-shown={net === "on" ? "false" : "true"}>
      {net === "off" ? t("pwa.offline") : net === "back" ? t("pwa.back") : null}
    </div>
  );
}
