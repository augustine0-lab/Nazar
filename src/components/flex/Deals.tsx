import { ActionForm } from "@/components/ActionForm";
import { answerDealAction, offerDealAction, replyCounterAction } from "@/app/actions";
import { canOfferDeal, DEAL_ICON, DEAL_NOTE_MAX, DEAL_OPTIONS, formatDate, type DealOption } from "@/lib/domain";
import type { Deal } from "@/lib/flex-services";
import { getT } from "@/lib/i18n/server";

/** The deal on a task as a short line: icon and what was agreed or offered. */
export async function DealBadge({ deal }: { deal: Deal | undefined }) {
  const { t } = await getT();
  if (!deal || deal.status === "DECLINED") return null;
  const option = deal.status === "COUNTERED" && deal.counterOption ? deal.counterOption : deal.option;
  return (
    <span className={`pill ${deal.status === "ACCEPTED" ? "good" : "star"}`}>
      <span aria-hidden="true">{DEAL_ICON[option]}</span> {t(`deal.st.${deal.status}`)}: {t(`deal.opt.${option}`)}
    </span>
  );
}

/** The child's side: offer a deal for the task, see the answer, take or refuse a counter-offer. */
export async function DealBox({ homeworkId, deals, authorIsAdult }: { homeworkId: string; deals: Deal[]; authorIsAdult: boolean }) {
  const { t, L } = await getT();
  if (!authorIsAdult) return <p className="muted small">{t("deal.ownTask")}</p>;
  const last = deals.at(-1);
  return (
    <div className="stack">
      {deals.map((d) => (
        <div key={d.id} className="deal">
          <span aria-hidden="true" className="deal-icon">{DEAL_ICON[d.option]}</span>
          <div className="stack" style={{ gap: 4 }}>
            <b>{t(`deal.opt.${d.option}`)}</b>
            {d.note && <span className="small">«{L(d.note)}»</span>}
            <span className={`pill ${d.status === "ACCEPTED" ? "good" : d.status === "DECLINED" ? "bad" : "star"}`}>{t(`deal.st.${d.status}`)}</span>
            {d.status === "COUNTERED" && d.counterOption && (
              <ActionForm action={replyCounterAction} className="stack">
                <input type="hidden" name="dealId" value={d.id} />
                <span>{t("deal.counterIs")} <b>{DEAL_ICON[d.counterOption]} {t(`deal.opt.${d.counterOption}`)}</b></span>
                <div className="row">
                  <button className="btn primary" name="accept" value="yes" type="submit">{t("deal.takeCounter")}</button>
                  <button className="btn" name="accept" value="no" type="submit">{t("deal.refuseCounter")}</button>
                </div>
              </ActionForm>
            )}
            {d.status === "ACCEPTED" && d.option === "LATER" && <span className="muted small">{t("deal.laterDone")}</span>}
          </div>
        </div>
      ))}
      {canOfferDeal(deals) ? (
        <details>
          <summary>{last?.status === "DECLINED" ? t("deal.tryAgain") : t("deal.offer")}</summary>
          <ActionForm action={offerDealAction} className="stack">
            <input type="hidden" name="homeworkId" value={homeworkId} />
            <fieldset className="deal-options">
              <legend className="small muted">{t("deal.pick")}</legend>
              {DEAL_OPTIONS.map((o, i) => (
                <label key={o} className="check">
                  <input type="radio" name="option" value={o} defaultChecked={i === 0} />
                  <span><span aria-hidden="true">{DEAL_ICON[o]}</span> {t(`deal.opt.${o}`)}</span>
                </label>
              ))}
            </fieldset>
            <label>
              {t("deal.note")}
              <input name="note" maxLength={DEAL_NOTE_MAX} placeholder={t("deal.notePh")} />
            </label>
            <button className="btn primary" type="submit">{t("deal.send")}</button>
          </ActionForm>
        </details>
      ) : (
        last?.status === "DECLINED" && <p className="muted small">{t("deal.noMore")}</p>
      )}
    </div>
  );
}

type Incoming = { deal: Deal; hw: { title: string; subject: string; dueDate: string }; child: string };

/** The adult's side: offers on the tasks they set, answered with one tap. */
export async function DealInbox({ items, showChild = false }: { items: Incoming[]; showChild?: boolean }) {
  const { lang, t, L } = await getT();
  if (!items.length) return <p className="muted small">{t("deal.inboxEmpty")}</p>;
  return (
    <div className="list">
      {items.map(({ deal, hw, child }) => (
        <ActionForm key={deal.id} action={answerDealAction} className="stack deal-answer">
          <input type="hidden" name="dealId" value={deal.id} />
          <span className="small muted">
            {showChild && <><b>{child}</b> · </>}
            {L(hw.subject)}: {L(hw.title)} · {t("deal.due", { date: formatDate(hw.dueDate, lang) })}
          </span>
          <span>
            <span aria-hidden="true">{DEAL_ICON[deal.option]}</span> <b>{t(`deal.opt.${deal.option}`)}</b>
            {deal.note && <> · «{L(deal.note)}»</>}
          </span>
          <div className="row">
            <button className="btn primary" name="answer" value="ACCEPT" type="submit">{t("deal.accept")}</button>
            <button className="btn" name="answer" value="DECLINE" type="submit">{t("deal.decline")}</button>
            <select name="counter" aria-label={t("deal.counterPick")} defaultValue="">
              <option value="">{t("deal.counterPick")}</option>
              {DEAL_OPTIONS.filter((o): o is Exclude<DealOption, "OWN"> => o !== "OWN" && o !== deal.option).map((o) => (
                <option key={o} value={o}>{DEAL_ICON[o]} {t(`deal.opt.${o}`)}</option>
              ))}
            </select>
            <button className="btn" name="answer" value="COUNTER" type="submit">{t("deal.counter")}</button>
          </div>
        </ActionForm>
      ))}
    </div>
  );
}
