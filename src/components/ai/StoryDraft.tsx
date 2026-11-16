"use client";

import { useState } from "react";
import { I } from "@/components/ui/Icon";
import { aiStoryAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { AI_SITUATION_MAX } from "@/lib/domain/ai";
import { AiSourceNote, fillField } from "./shared";

/** «Черновик истории»: one line about the situation fills the story form; the adult reads, fixes and saves. */
export function StoryDraft({ studentId, titleId, stepsId }: { studentId: string; titleId: string; stepsId: string }) {
  const { t } = useI18n();
  const [situation, setSituation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ source: "GEMINI" | "OFFLINE"; fallback: string | null } | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    setDone(null);
    try {
      const reply = await aiStoryAction({ studentId, situation });
      if (!reply.ok) return setError(reply.error);
      fillField(document.getElementById(titleId) as HTMLInputElement | null, reply.data.title);
      fillField(document.getElementById(stepsId) as HTMLTextAreaElement | null, reply.data.lines);
      setDone({ source: reply.source, fallback: reply.fallback });
      document.getElementById(titleId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card ai-box">
      <h2><I name="sparkles" /> {t("ai.story.title")}</h2>
      <p className="muted small">{t("ai.story.lead")}</p>
      <div className="row">
        <label className="sr-only" htmlFor="ai-situation">{t("ai.story.placeholder")}</label>
        <input id="ai-situation" style={{ flex: "1 1 260px" }} value={situation} maxLength={AI_SITUATION_MAX} onChange={(e) => setSituation(e.target.value)} placeholder={t("ai.story.placeholder")} />
        <button type="button" className="btn ai" onClick={ask} disabled={busy || situation.trim().length < 3} aria-busy={busy}>
          <I name="sparkles" /> {busy ? t("ai.working") : t("ai.story.ask")}
        </button>
      </div>
      {done && (
        <>
          <p className="msg ok" role="status">{t("ai.story.done")}</p>
          <AiSourceNote {...done} />
        </>
      )}
      {error && <p className="msg err" role="alert">{error}</p>}
    </section>
  );
}
