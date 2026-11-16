"use client";

import { useRef, useState } from "react";
import { I } from "@/components/ui/Icon";
import { aiPhotoStepsAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { AiSourceNote, fillField, toBase64 } from "./shared";

const MAX_SIDE = 1600;

/** A phone photo is several megabytes: it is shrunk in the browser to a readable JPEG before it is sent. */
async function shrink(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/jpeg", 0.85));
}

/** «Шаги по фото»: a photo of the task fills the homework form; the adult checks it and saves as usual. */
export function PhotoSteps({ studentId }: { studentId: string }) {
  const { t } = useI18n();
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ source: "GEMINI" | "OFFLINE"; fallback: string | null } | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let blob: Blob = file;
      try {
        blob = await shrink(file);
      } catch {
        // A browser that cannot draw this format sends the file as it is; the server checks the type and size.
      }
      const res = await aiPhotoStepsAction({ studentId, mime: blob.type || file.type, data: await toBase64(blob) });
      if (!res.ok) return setError(res.error);
      const form = box.current?.closest("form");
      const field = (name: string) => form?.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
      if (res.data.subject) fillField(field("subject"), res.data.subject);
      if (res.data.title) fillField(field("title"), res.data.title);
      fillField(field("steps"), res.data.steps.join("\n"));
      fillField(field("estMinutes"), String(res.data.estMinutes));
      setResult({ source: res.source, fallback: res.fallback });
    } catch {
      setError(t("err.fields"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <div ref={box} className="ai-box stack" style={{ gap: 6 }}>
      <div className="row">
        <button type="button" className="btn ai" onClick={() => input.current?.click()} disabled={busy} aria-busy={busy}>
          <I name="camera" /> {busy ? t("ai.photo.reading") : t("ai.photo.button")}
        </button>
        <span className="muted small">{t("ai.photo.hint")}</span>
      </div>
      <input ref={input} type="file" accept="image/*" capture="environment" hidden data-testid="ai-photo-input" onChange={(e) => onFile(e.target.files?.[0])} />
      {result && (
        <>
          <p className="msg ok" role="status">{result.source === "GEMINI" ? t("ai.photo.done") : t("ai.photo.offline")}</p>
          <AiSourceNote {...result} />
        </>
      )}
      {error && <p className="msg err" role="alert">{error}</p>}
    </div>
  );
}
