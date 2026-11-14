"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { GazeApi } from "./useGaze";

/**
 * The «Взгляд» button under a living text, the consent panel before the camera starts, and the dot to
 * look at while Nazar learns where the screen is. `wide` is the teacher at the projector.
 */
export function GazeControl({ gaze, wide }: { gaze: GazeApi; wide: boolean }) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const { status, error, looking, progress, videoRef } = gaze;
  const busy = status === "loading" || status === "calibrating";
  const start = () => {
    setOpen(false);
    void gaze.start();
  };

  return (
    <>
      {status === "on" ? (
        <span className="gz-on">
          <span className={`gz-dot ${looking ? "yes" : "no"}`} role="img" aria-label={t(looking ? "gz.lookingYes" : "gz.lookingNo")} title={t(looking ? "gz.lookingYes" : "gz.lookingNo")} />
          <span className="small">{t("gz.on")}</span>
          <button type="button" className="btn quiet" onClick={start} title={t("gz.againHint")}>{t("gz.again")}</button>
          <button type="button" className="btn quiet" onClick={gaze.stop}>{t("gz.off")}</button>
        </span>
      ) : (
        <button type="button" className="btn quiet" aria-expanded={open || busy} onClick={() => setOpen((o) => !o)} disabled={busy}>
          {t("gz.button")}
        </button>
      )}

      {(open || error) && status === "off" && (
        <section className="gz-panel" aria-labelledby="gz-title">
          <h3 id="gz-title">{t("gz.title")}</h3>
          {error ? (
            <p role="alert">{t(`gz.err.${error}`)}</p>
          ) : (
            <>
              <p>{t(wide ? "gz.leadWide" : "gz.lead")}</p>
              <ul className="gz-points">
                <li>{t("gz.private1")}</li>
                <li>{t("gz.private2")}</li>
                <li>{t("gz.light")}</li>
              </ul>
            </>
          )}
          <div className="row">
            <button type="button" className="btn primary" onClick={start}>{t(error ? "gz.retry" : "gz.start")}</button>
            <button type="button" className="btn quiet" onClick={() => { setOpen(false); gaze.stop(); }}>{t("gz.later")}</button>
          </div>
        </section>
      )}

      {busy && (
        <div className="gz-calib" role="dialog" aria-modal="true" aria-labelledby="gz-calib-title">
          {status === "loading" ? (
            <p className="gz-calib-text" id="gz-calib-title" role="status">{t("gz.loading")}</p>
          ) : (
            <>
              <span className="gz-target" style={{ "--p": progress } as React.CSSProperties} aria-hidden="true" />
              <p className="gz-calib-text" id="gz-calib-title"><b>{t(wide ? "gz.calibrateWide" : "gz.calibrate")}</b><br />{t(wide ? "gz.calibrateHintWide" : "gz.calibrateHint")}</p>
            </>
          )}
          <button type="button" className="btn quiet" onClick={gaze.stop}>{t("gz.cancel")}</button>
        </div>
      )}

      {/* The camera picture is only for the model; a small mirror shows it while calibrating, so the reader sees they are in the frame. */}
      <video ref={videoRef} className={`gz-video ${status === "calibrating" ? "show" : ""}`} playsInline muted aria-hidden="true" />
    </>
  );
}
