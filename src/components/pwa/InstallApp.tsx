"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useI18n } from "@/lib/i18n/client";
import { Icon, I } from "../ui/Icon";
import { installState, promptInstall, subscribe, type InstallState } from "./install-store";

function useInstallState(): InstallState | null {
  const state = useSyncExternalStore(subscribe, installState, () => null);
  // The first render on the client matches the server (nothing), then the real state shows.
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);
  return ready ? state : null;
}

/** A small button for the top bar: only where the browser can install right away (Chrome, Edge, Android). */
export function InstallButton() {
  const { t } = useI18n();
  const state = useInstallState();
  if (state !== "prompt") return null;
  return (
    <button type="button" className="btn quiet install-btn" onClick={() => void promptInstall()} title={t("pwa.installTitle")} aria-label={t("pwa.installTitle")}>
      <Icon name="install" /> <span className="lbl">{t("pwa.install")}</span>
    </button>
  );
}

/** A card with the install button, or the steps for browsers that install from their own menu (Safari on iPhone). */
export function InstallCard({ compact = false }: { compact?: boolean }) {
  const { t } = useI18n();
  const state = useInstallState();
  // On the login screen the card shows only where it helps: a ready install button or the iPhone steps.
  if (!state || (compact && (state === "installed" || state === "manual"))) return null;
  return (
    <section className={compact ? "install-card stack" : "card install-card"} aria-labelledby="install-title">
      <h2 id="install-title"><I name="phone" /> {t("pwa.title")}</h2>
      {state === "installed" ? (
        <p>{t("pwa.installed")}</p>
      ) : (
        <>
          <p className={compact ? "muted small" : undefined}>{t("pwa.lead")}</p>
          {state === "prompt" && (
            <div className="row">
              <button type="button" className="btn primary" onClick={() => void promptInstall()}>{t("pwa.installTitle")}</button>
            </div>
          )}
          {state === "ios" && <p className="small">{t("pwa.iosHow")}</p>}
          {state === "manual" && (
            <ul className="small" style={{ margin: 0, paddingLeft: 18 }}>
              <li>{t("pwa.androidHow")}</li>
              <li>{t("pwa.iosHow")}</li>
            </ul>
          )}
        </>
      )}
      {!compact && <p className="muted small">{t("pwa.privacy")}</p>}
    </section>
  );
}
