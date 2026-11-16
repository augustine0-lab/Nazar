"use client";

import { useState } from "react";
import { I } from "@/components/ui/Icon";
import { aiSoftenAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { AiSourceNote, fillField } from "./shared";

/**
 * «Сказать мягче»: next to a note or a message about the child. The adult picks a calmer wording or keeps their own.
 * Works on any text field by its id, so the same button serves the day note and the chat.
 */
export function SoftenButton({ studentId, targetId }: { studentId: string; targetId: string }) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<{ options: string[]; serious: boolean; source: "GEMINI" | "OFFLINE"; fallback: string | null } | null>(null);

  const field = () => document.getElementById(targetId) as HTMLTextAreaElement | null;

  async function ask() {
    const text = field()?.value.trim() ?? "";
    setError(null);
    setRes(null);
    if (!text) return setError(t("ai.soft.empty"));
    setBusy(true);
    try {
      const reply = await aiSoftenAction({ studentId, text });
      if (!reply.ok) return setError(reply.error);
      setRes({ ...reply.data, source: reply.source, fallback: reply.fallback });
    } finally {
      setBusy(false);
    }
  }

  function use(option: string) {
    fillField(field(), option);
    field()?.focus();
    setRes(null);
  }

  return (
    <div className="stack" style={{ gap: 6 }}>
      <div>
        <button type="button" className="chip ai" onClick={ask} disabled={busy} aria-busy={busy}>
          <I name="sparkles" /> {busy ? t("ai.working") : t("ai.soft.button")}
        </button>
      </div>
      {res && (
        <div className="stack ai-result" style={{ gap: 6 }} data-testid="ai-soften-result">
          {res.serious ? (
            <p className="msg err" role="alert">{t("ai.soft.serious")}</p>
          ) : res.options.length ? (
            <>
              <span className="muted small">{t("ai.soft.pick")}</span>
              {res.options.map((o) => (
                <button key={o} type="button" className="chip ai-option" onClick={() => use(o)}>{o}</button>
              ))}
            </>
          ) : (
            <p className="small">{t("ai.soft.same")}</p>
          )}
          <AiSourceNote source={res.source} fallback={res.fallback} />
        </div>
      )}
      {error && <p className="msg err" role="alert">{error}</p>}
    </div>
  );
}
