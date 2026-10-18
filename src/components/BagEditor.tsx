import { ActionForm } from "./ActionForm";
import { deleteBagItemAction, saveBagItemAction } from "@/app/actions";
import { BAG_ICONS, MAX_BAG_ITEMS } from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

/** Adults list what goes into the bag every evening. */
export async function BagEditor({ studentId, items }: { studentId: string; items: { id: string; title: string; icon: string }[] }) {
  const { t, L } = await getT();
  return (
    <div className="stack">
      <p className="muted small">{t("bag.editorHint")}</p>
      {items.length ? (
        <div className="list">
          {items.map((it) => (
            <div key={it.id} className="sched-edit bag-edit">
              <span aria-hidden="true" style={{ fontSize: "1.6rem" }}>{it.icon}</span>
              <span>{L(it.title)}</span>
              <ActionForm action={deleteBagItemAction}>
                <input type="hidden" name="studentId" value={studentId} />
                <input type="hidden" name="itemId" value={it.id} />
                <button className="btn quiet" type="submit">{t("bag.delete")}</button>
              </ActionForm>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">{t("bag.none")}</p>
      )}
      {items.length < MAX_BAG_ITEMS && (
        <ActionForm action={saveBagItemAction} className="form-grid">
          <input type="hidden" name="studentId" value={studentId} />
          <label>{t("bag.what")}<input name="title" maxLength={40} placeholder={t("bag.whatExample")} required /></label>
          <label>
            {t("bag.icon")}
            <select name="icon" defaultValue={BAG_ICONS[0]} style={{ fontSize: "1.3rem" }}>
              {BAG_ICONS.map((ic) => <option key={ic} value={ic}>{ic}</option>)}
            </select>
          </label>
          <button className="btn primary" type="submit">{t("bag.add")}</button>
        </ActionForm>
      )}
    </div>
  );
}
