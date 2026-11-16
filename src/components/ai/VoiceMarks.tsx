"use client";

import { useEffect, useRef, useState } from "react";
import { I } from "@/components/ui/Icon";
import { aiVoiceMarksAction } from "@/app/actions";
import { useI18n } from "@/lib/i18n/client";
import { AI_AUDIO_SECONDS } from "@/lib/domain/ai";
import { AiSourceNote, NOTE_APPEND_EVENT, toBase64 } from "./shared";

type Suggest = {
  marks: { goalId: string; value: "YES" | "NO"; quote: string }[];
  note: string;
  transcript: string;
  audioOnly: boolean;
  source: "GEMINI" | "OFFLINE";
  fallback: string | null;
};

const MIME_CHOICES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

/**
 * «Отметить голосом»: the teacher says or types how the lesson went, Nazar suggests a mark for each goal,
 * the teacher applies them with one tap (or fixes them in the grid as usual).
 */
export function VoiceMarks(props: {
  studentId: string;
  date: string;
  lesson: number;
  goals: { id: string; text: string }[];
  onApply: (marks: { goalId: string; value: "YES" | "NO" }[]) => Promise<boolean>;
}) {
  const { t } = useI18n();
  const [text, setText] = useState("");
  const [audio, setAudio] = useState<{ blob: Blob; secs: number } | null>(null);
  const [recording, setRecording] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [res, setRes] = useState<Suggest | null>(null);
  const rec = useRef<MediaRecorder | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => () => {
    rec.current?.state === "recording" && rec.current.stop();
    if (timer.current) window.clearTimeout(timer.current);
  }, []);
  // A suggestion belongs to one lesson: switching the lesson clears it.
  useEffect(() => setRes(null), [props.lesson]);

  async function record() {
    if (recording) return rec.current?.stop();
    setError(null);
    setInfo(null);
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      return setError(t("ai.voice.noMic"));
    }
    const mimeType = MIME_CHOICES.find((m) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(m));
    const r = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32_000 } : undefined);
    const chunks: Blob[] = [];
    const started = Date.now();
    r.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    r.onstop = () => {
      stream.getTracks().forEach((tr) => tr.stop());
      if (timer.current) window.clearTimeout(timer.current);
      setRecording(false);
      const blob = new Blob(chunks, { type: r.mimeType || mimeType || "audio/webm" });
      setAudio({ blob, secs: Math.max(1, Math.round((Date.now() - started) / 1000)) });
    };
    rec.current = r;
    r.start();
    setRecording(true);
    timer.current = window.setTimeout(() => r.state === "recording" && r.stop(), AI_AUDIO_SECONDS * 1000);
  }

  async function ask() {
    setBusy(true);
    setError(null);
    setInfo(null);
    setRes(null);
    try {
      const reply = await aiVoiceMarksAction({
        studentId: props.studentId,
        date: props.date,
        text: text.trim() || undefined,
        audio: audio ? { mime: audio.blob.type, data: await toBase64(audio.blob) } : undefined,
      });
      if (!reply.ok) return setError(reply.error);
      setRes({ ...reply.data, source: reply.source, fallback: reply.fallback });
    } finally {
      setBusy(false);
    }
  }

  async function apply() {
    if (!res) return;
    if (await props.onApply(res.marks.map(({ goalId, value }) => ({ goalId, value })))) setInfo(t("ai.voice.applied"));
  }

  function toNote() {
    if (!res?.note) return;
    window.dispatchEvent(new CustomEvent(NOTE_APPEND_EVENT, { detail: res.note }));
    setInfo(t("ai.voice.noteAdded"));
  }

  const goalText = (id: string) => props.goals.find((g) => g.id === id)?.text ?? "";

  return (
    <details className="ai-box">
      <summary><I name="sparkles" /> <b>{t("ai.voice.title")}</b></summary>
      <div className="stack" style={{ marginTop: 10 }}>
        <p className="muted small">{t("ai.voice.lead", { n: props.lesson })}</p>
        <div className="row">
          <button type="button" className={`btn ${recording ? "danger" : ""}`} onClick={record} aria-pressed={recording}>
            <I name="mic" /> {recording ? t("ai.voice.stop") : t("ai.voice.record")}
          </button>
          {recording && <span className="muted small" role="status">{t("ai.voice.recording", { s: AI_AUDIO_SECONDS })}</span>}
          {audio && !recording && (
            <>
              <span className="pill good">{t("ai.voice.recorded", { s: audio.secs })}</span>
              <button type="button" className="btn quiet" onClick={() => setAudio(null)}>{t("ai.voice.drop")}</button>
            </>
          )}
        </div>
        <label className="sr-only" htmlFor="ai-voice-text">{t("ai.voice.placeholder")}</label>
        <textarea id="ai-voice-text" rows={2} maxLength={1000} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("ai.voice.placeholder")} />
        <div>
          <button type="button" className="btn ai" onClick={ask} disabled={busy || recording || (!text.trim() && !audio)} aria-busy={busy}>
            <I name="sparkles" /> {busy ? t("ai.working") : t("ai.voice.ask")}
          </button>
        </div>
        {res && (
          <div className="stack ai-result" style={{ gap: 8 }} data-testid="ai-voice-result">
            <b>{t("ai.voice.suggest", { n: props.lesson })}</b>
            {res.transcript && res.source === "GEMINI" && res.audioOnly && <p className="small"><span className="muted">{t("ai.voice.heard")}:</span> «{res.transcript}»</p>}
            {res.marks.length ? (
              <ul className="stack" style={{ gap: 6, margin: 0, paddingLeft: 18 }}>
                {res.marks.map((m) => (
                  <li key={m.goalId}>
                    <span className={`pill ${m.value === "YES" ? "good" : "bad"}`}>{m.value === "YES" ? t("common.yes") : t("common.no")}</span> {goalText(m.goalId)}
                    {m.quote && <span className="muted small"> · «{m.quote}»</span>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="small">{res.audioOnly && res.source === "OFFLINE" ? t("ai.voice.audioOffline") : t("ai.voice.none")}</p>
            )}
            <div className="row">
              {res.marks.length > 0 && <button type="button" className="btn primary" onClick={apply}>{t("ai.voice.apply")}</button>}
              {res.note && <button type="button" className="btn" onClick={toNote}>{t("ai.voice.toNote")}</button>}
            </div>
            <AiSourceNote source={res.source} fallback={res.fallback} />
          </div>
        )}
        {info && <p className="msg ok" role="status">{info}</p>}
        {error && <p className="msg err" role="alert">{error}</p>}
      </div>
    </details>
  );
}
