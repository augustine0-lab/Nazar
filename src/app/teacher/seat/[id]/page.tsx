import { I } from "@/components/ui/Icon";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Shell } from "@/components/Shell";
import { ActionForm } from "@/components/ActionForm";
import { moveSeatAction, saveLayoutAction } from "@/app/actions";
import { getDb } from "@/db";
import { can } from "@/lib/access";
import { requireUser } from "@/lib/session";
import * as S from "@/lib/services";
import * as X from "@/lib/flex-services";
import * as D from "@/lib/domain";
import { getT } from "@/lib/i18n/server";

/** "Where I sit best": the plan of the room, the child's seats over time and the behaviour card on each. */
export default async function SeatPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser("TEACHER");
  const { lang, t } = await getT();
  const { id } = await params;
  const db = getDb();
  if (!(await can(db, user, "SEAT", id))) notFound();
  const { student, cls } = await S.getStudent(db, id);
  const { layout, periods, verdict, current } = await X.seatReport(db, user, id);
  const initials = student.displayName.split(/\s+/).map((w) => w[0]).join("").slice(0, 2);
  const traits = (row: number, col: number) => D.seatTraits(row, col, layout).map((x) => t(`seat.trait.${x}`)).join(", ");
  const past = new Map(periods.slice(0, -1).map((p) => [`${p.row}-${p.col}`, p]));
  const [before, now] = periods.slice(-2);
  const daysOnSeat = current ? D.schoolDaysBetween(current.from, S.today()).length : 0;

  return (
    <Shell current="/teacher">
      <div className="stack" style={{ gap: 2 }}>
        <Link href={`/teacher/student/${id}`} className="small">← {student.displayName}</Link>
        <h1><I name="seat" /> {t("seat.title")}</h1>
        <span className="muted">{cls.name}</span>
      </div>

      <section className="card">
        <p className="small">{t("seat.lead", { name: student.displayName.split(" ")[0], n: D.SEAT_SUGGESTED_DAYS })}</p>
        <ActionForm action={moveSeatAction} className="stack">
          <input type="hidden" name="studentId" value={id} />
          <div className={`classroom win-${layout.windowSide.toLowerCase()}`}>
            <div className="classroom-board" aria-hidden="true">{t("seat.board")}</div>
            <div className="classroom-grid" style={{ gridTemplateColumns: `repeat(${layout.cols}, minmax(0, 1fr))` }}>
              {Array.from({ length: layout.rows }, (_, r) =>
                Array.from({ length: layout.cols }, (_, c) => {
                  const here = current && current.row === r && current.col === c;
                  const was = past.get(`${r}-${c}`);
                  const label = `${t("seat.place", { row: r + 1, col: c + 1 })}${traits(r, c) ? `, ${traits(r, c)}` : ""}`;
                  return (
                    <button
                      key={`${r}-${c}`}
                      type="submit"
                      name="pos"
                      value={`${r}-${c}`}
                      className={`desk ${here ? "here" : ""} ${was ? "was" : ""}`}
                      aria-label={here ? `${label}. ${t("seat.now")}` : `${label}. ${t("seat.moveHere")}`}
                      aria-pressed={Boolean(here)}
                      title={label}
                    >
                      {here ? <b>{initials}</b> : was ? <span className="small">{D.formatDate(was.from, lang)}</span> : null}
                    </button>
                  );
                }),
              )}
            </div>
            <div className="classroom-legend small muted">
              <span><I name="window" /> {layout.windowSide === "LEFT" ? t("seat.windowLeft") : t("seat.windowRight")}</span>
              <span><I name="door" /> {t("seat.door")}</span>
            </div>
          </div>
          <p className="muted small">{t("seat.tapHint")}</p>
        </ActionForm>
      </section>

      <section className="card">
        <h2>{t("seat.compare")}</h2>
        {periods.length === 0 ? (
          <p className="muted">{t("seat.none")}</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr><th>{t("seat.th.place")}</th><th>{t("seat.th.dates")}</th><th>{t("seat.th.days")}</th><th>{t("seat.th.pct")}</th></tr>
              </thead>
              <tbody>
                {[...periods].reverse().map((p) => (
                  <tr key={p.from}>
                    <td>{t("seat.place", { row: p.row + 1, col: p.col + 1 })}{traits(p.row, p.col) && <span className="muted small"> · {traits(p.row, p.col)}</span>}</td>
                    <td className="num">{D.formatDate(p.from, lang)} – {D.formatDate(p.to, lang)}</td>
                    <td className="num">{p.days}</td>
                    <td className="num">{p.ratio === null ? "—" : `${D.pct(p.ratio)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className={`msg ${verdict === "BETTER" ? "ok" : ""}`}>
          {verdict === "NOT_ENOUGH"
            ? t("seat.v.NOT_ENOUGH", { min: D.SEAT_MIN_DAYS, n: D.SEAT_SUGGESTED_DAYS, now: daysOnSeat })
            : t(`seat.v.${verdict}`, { before: D.pct(before.ratio) ?? 0, now: D.pct(now.ratio) ?? 0 })}
        </p>
        <p className="muted small">{t("seat.honest")}</p>
      </section>

      <section className="card">
        <details>
          <summary>{t("seat.layout")}</summary>
          <ActionForm action={saveLayoutAction} className="row">
            <input type="hidden" name="studentId" value={id} />
            <label>{t("seat.rows")}
              <select name="rows" defaultValue={layout.rows}>{D.LAYOUT_ROWS.map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <label>{t("seat.cols")}
              <select name="cols" defaultValue={layout.cols}>{D.LAYOUT_COLS.map((n) => <option key={n} value={n}>{n}</option>)}</select>
            </label>
            <label>{t("seat.window")}
              <select name="windowSide" defaultValue={layout.windowSide}>
                <option value="LEFT">{t("seat.windowLeft")}</option>
                <option value="RIGHT">{t("seat.windowRight")}</option>
              </select>
            </label>
            <button className="btn" type="submit">{t("seat.saveLayout")}</button>
          </ActionForm>
        </details>
      </section>
    </Shell>
  );
}
