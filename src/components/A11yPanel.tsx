"use client";

import { useEffect, useRef, useState } from "react";
import { PREFS_COOKIE, prefsAttributes, serializePrefs, type Prefs } from "@/lib/prefs";
import { useI18n } from "@/lib/i18n/client";
import { stopSpeaking, speak, speechSupported } from "./speech";

/** View settings: text size, reading mode, theme, calm mode and reading the page aloud. Saved in a cookie on this device. */
export function A11yPanel({ initial }: { initial: Prefs }) {
  const { t, lang } = useI18n();
  const [prefs, setPrefs] = useState(initial);
  const [speaking, setSpeaking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDetailsElement>(null);

  function update(patch: Partial<Prefs>) {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    try {
      document.cookie = `${PREFS_COOKIE}=${serializePrefs(next)}; path=/; max-age=31536000; samesite=lax`;
    } catch {}
    for (const [k, v] of Object.entries(prefsAttributes(next))) document.documentElement.setAttribute(k, v);
  }

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current?.open && !ref.current.contains(e.target as Node)) ref.current.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  useEffect(() => () => stopSpeaking(), []);

  function toggleSpeech() {
    if (speaking) {
      stopSpeaking();
      setSpeaking(false);
      return;
    }
    if (!speechSupported()) return setNote(t("a11y.noSpeech"));
    const text = document.querySelector("main")?.innerText ?? "";
    const res = speak(text, lang, () => setSpeaking(false));
    if (res === "novoice") setNote(t("a11y.noVoice"));
    else setNote(null);
    setSpeaking(res === "ok");
  }

  return (
    <details className="a11y" ref={ref}>
      <summary className="btn quiet" aria-label={t("a11y.title")}>
        <span aria-hidden="true">Aa</span> {t("a11y.open")}
      </summary>
      <div className="a11y-body" role="group" aria-label={t("a11y.title")}>
        <div className="stack">
          <span className="eyebrow">{t("a11y.textSize")}</span>
          <div className="seg" role="group" aria-label={t("a11y.textSize")}>
            {([0, 1, 2] as const).map((n) => (
              <button key={n} type="button" aria-pressed={prefs.fs === n} onClick={() => update({ fs: n })}>
                {t(`a11y.size${n}`)}
              </button>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={prefs.rd} onChange={(e) => update({ rd: e.target.checked })} />
          <span><b>{t("a11y.reading")}</b><br /><span className="muted small">{t("a11y.readingHint")}</span></span>
        </label>
        <div className="stack">
          <span className="eyebrow">{t("a11y.theme")}</span>
          <div className="seg" role="group" aria-label={t("a11y.theme")}>
            {(["auto", "light", "dark"] as const).map((th) => (
              <button key={th} type="button" aria-pressed={prefs.th === th} onClick={() => update({ th })}>{t(`a11y.theme.${th}`)}</button>
            ))}
          </div>
        </div>
        <label className="check">
          <input type="checkbox" checked={prefs.cm} onChange={(e) => update({ cm: e.target.checked })} />
          <span><b>{t("a11y.calm")}</b><br /><span className="muted small">{t("a11y.calmHint")}</span></span>
        </label>
        <button type="button" className="btn" onClick={toggleSpeech}>{speaking ? t("a11y.stop") : `🔊 ${t("a11y.speakPage")}`}</button>
        {note && <p className="msg err" role="status">{note}</p>}
      </div>
    </details>
  );
}
