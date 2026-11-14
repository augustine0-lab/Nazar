import { ActionForm } from "@/components/ActionForm";
import { startSoundAction, stopSoundAction } from "@/app/actions";
import { SOUND_ICON, SOUND_TRIAL_DAYS, SOUNDS, formatDate, pct, type SoundSide } from "@/lib/domain";
import type * as X from "@/lib/flex-services";
import { getT } from "@/lib/i18n/server";

type Report = Awaited<ReturnType<typeof X.soundReport>>;

/** The own-sound experiment: how to start it (for the child) and what it showed so far (for everyone around the child). */
export async function SoundCard({ studentId, report, manage }: { studentId: string; report: Report; manage: boolean }) {
  const { lang, t } = await getT();
  if (!report && !manage) return null;
  const side = (key: "snd.withSound" | "snd.withoutSound", s: SoundSide) => (
    <div className="stack" style={{ gap: 4 }}>
      <div className="row between">
        <span>{t(key)}</span>
        <span className="muted small num">{s.checks ? t("snd.share", { on: s.onTask, n: s.checks, pct: pct(s.ratio) ?? 0 }) : t("snd.noChecks")}</span>
      </div>
      <div className="bar"><i style={{ width: `${(s.ratio ?? 0) * 100}%` }} /></div>
    </div>
  );
  return (
    <div className="stack">
      {!report ? (
        <>
          <p className="small">{t("snd.trialLead", { n: SOUND_TRIAL_DAYS })}</p>
          <ActionForm action={startSoundAction} className="row">
            <input type="hidden" name="studentId" value={studentId} />
            <select name="sound" aria-label={t("snd.pick")} defaultValue="rain">
              {SOUNDS.map((s) => <option key={s} value={s}>{SOUND_ICON[s]} {t(`snd.kind.${s}`)}</option>)}
            </select>
            <button className="btn" type="submit">{t("snd.start")}</button>
          </ActionForm>
        </>
      ) : (
        <>
          <span className="muted small">
            {t("snd.trialOn", { sound: `${SOUND_ICON[report.trial.sound]} ${t(`snd.kind.${report.trial.sound}`)}`, from: formatDate(report.trial.startedOn, lang), to: formatDate(report.end, lang) })}
          </span>
          {side("snd.withSound", report.sound)}
          {side("snd.withoutSound", report.quiet)}
          <p className={`msg ${report.verdict === "HELPS" ? "ok" : ""}`}>{t(manage ? `snd.v.${report.verdict}` : `snd.va.${report.verdict}`)}</p>
          <p className="muted small">{t("snd.honest")}</p>
          {manage && (
            <ActionForm action={stopSoundAction}>
              <input type="hidden" name="studentId" value={studentId} />
              <button className="btn" type="submit">{report.today === "DONE" ? t("snd.again") : t("snd.stopTrial")}</button>
            </ActionForm>
          )}
        </>
      )}
    </div>
  );
}
