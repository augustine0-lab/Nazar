import { setLangAction } from "@/app/actions";
import { getT } from "@/lib/i18n/server";

const LABEL = { ru: "Рус", kk: "Қаз" } as const;

/** Two buttons, not a menu: a child or a teacher can see both languages at once. */
export async function LangSwitch() {
  const { lang, t } = await getT();
  return (
    <div className="seg lang" role="group" aria-label={t("lang.label")}>
      {(["ru", "kk"] as const).map((l) => (
        <form key={l} action={setLangAction.bind(null, l)}>
          <button type="submit" lang={l} aria-pressed={lang === l}>{LABEL[l]}</button>
        </form>
      ))}
    </div>
  );
}
