import { ActionForm } from "./ActionForm";
import { deleteScheduleItemAction, saveScheduleItemAction } from "@/app/actions";
import { SCHEDULE_EMOJI } from "@/lib/icons";
import { SCHEDULE_ICONS, type ScheduleIcon } from "@/db/schema";
import { WEEKDAYS, type MsgKey } from "@/lib/i18n";
import { getT } from "@/lib/i18n/server";

interface Item {
  id: string;
  weekday: number;
  time: string;
  title: string;
  icon: ScheduleIcon;
}

/** Adults build the child's day here: a time, a few words and a picture, for the days they choose. */
export async function ScheduleEditor({ studentId, items }: { studentId: string; items: Item[] }) {
  const { lang, t, L } = await getT();
  const days = WEEKDAYS[lang];
  return (
    <div className="stack">
      <p className="muted small">{t("sch.hint")}</p>
      {[1, 2, 3, 4, 5, 6, 7].map((wd) => {
        const day = items.filter((i) => i.weekday === wd);
        if (!day.length) return null;
        return (
          <div key={wd} className="stack">
            <h3>{days[wd - 1]}</h3>
            <div className="list">
              {day.map((it) => (
                <div key={it.id} className="sched-edit">
                  <span aria-hidden="true" style={{ fontSize: "1.6rem" }}>{SCHEDULE_EMOJI[it.icon]}</span>
                  <span className="num muted">{it.time}</span>
                  <span>{L(it.title)}</span>
                  <ActionForm action={deleteScheduleItemAction}>
                    <input type="hidden" name="studentId" value={studentId} />
                    <input type="hidden" name="itemId" value={it.id} />
                    <button className="btn quiet" type="submit">{t("sch.delete")}</button>
                  </ActionForm>
                </div>
              ))}
            </div>
          </div>
        );
      })}
      {!items.length && <p className="muted">{t("sch.noItems")}</p>}
      <ActionForm action={saveScheduleItemAction} className="stack">
        <input type="hidden" name="studentId" value={studentId} />
        <div className="form-grid">
          <label>{t("sch.time")}<input name="time" type="time" defaultValue="07:30" required /></label>
          <label>{t("sch.what")}<input name="title" maxLength={60} placeholder={t("sch.whatExample")} required /></label>
          <label>
            {t("sch.icon")}
            <select name="icon" defaultValue="bag">
              {SCHEDULE_ICONS.map((ic) => <option key={ic} value={ic}>{SCHEDULE_EMOJI[ic]} {t(`sch.icon.${ic}` as MsgKey)}</option>)}
            </select>
          </label>
        </div>
        <fieldset className="days">
          <legend className="small muted">{t("sch.days")}</legend>
          {days.map((d, i) => (
            <label key={i}><input type="checkbox" name="weekday" value={i + 1} defaultChecked={i < 5} />{d}</label>
          ))}
        </fieldset>
        <div><button className="btn primary" type="submit">{t("sch.add")}</button></div>
      </ActionForm>
    </div>
  );
}
