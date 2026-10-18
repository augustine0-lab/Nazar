import { ActionForm } from "./ActionForm";
import { choosePetAction } from "@/app/actions";
import { PET_EMOJI, PET_ACCESSORY } from "@/lib/icons";
import { PET_KINDS } from "@/db/schema";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

type PetInfo = { pet: { kind: (typeof PET_KINDS)[number]; name: string } | null; stage: number; last: boolean; toNext: number };

/** The child's pet: grows with all stars ever earned, so spending stars on rewards never makes it shrink. */
export async function PetCard({ studentId, info }: { studentId: string; info: PetInfo }) {
  const { t, L } = await getT();
  const { pet, stage, last, toNext } = info;
  const stageName = t(`pet.stage${stage}` as MsgKey);
  return (
    <section className="card">
      <h2>{t("pet.title")}</h2>
      {pet ? (
        <>
          <div className="pet-box">
            <span className="pet" data-stage={stage} role="img" aria-label={`${L(pet.name)}: ${stageName}`}>
              {PET_ACCESSORY[stage] && <span className="acc" aria-hidden="true">{PET_ACCESSORY[stage]}</span>}
              {PET_EMOJI[pet.kind]}
            </span>
            <div className="stack">
              <p>{t("pet.growth", { name: L(pet.name), stage: stageName })}</p>
              <p className="muted small">{last ? t("pet.max", { name: L(pet.name) }) : t("pet.toNext", { n: toNext })}</p>
              <p className="muted small">{t("pet.hint")}</p>
            </div>
          </div>
          <details>
            <summary className="muted small">{t("pet.change")}</summary>
            <div style={{ marginTop: 12 }}><PetForm studentId={studentId} kind={pet.kind} name={L(pet.name)} /></div>
          </details>
        </>
      ) : (
        <>
          <p>{t("pet.choose")}</p>
          <PetForm studentId={studentId} kind="fox" name="" />
        </>
      )}
    </section>
  );
}

async function PetForm({ studentId, kind, name }: { studentId: string; kind: string; name: string }) {
  const { t } = await getT();
  return (
    <ActionForm action={choosePetAction} className="stack">
      <input type="hidden" name="studentId" value={studentId} />
      <fieldset className="kinds">
        <legend className="sr-only">{t("pet.choose")}</legend>
        {PET_KINDS.map((k) => (
          <label key={k}>
            <input type="radio" name="kind" value={k} defaultChecked={k === kind} />
            <span className="face" aria-hidden="true">{PET_EMOJI[k]}</span>
            <span className="small">{t(`pet.kind.${k}` as MsgKey)}</span>
          </label>
        ))}
      </fieldset>
      <label>
        {t("pet.name")}
        <input name="name" defaultValue={name} maxLength={20} placeholder={t("pet.namePlaceholder")} required />
      </label>
      <button className="btn primary" type="submit">{t("pet.save")}</button>
    </ActionForm>
  );
}
