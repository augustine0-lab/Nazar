import { Shell } from "@/components/Shell";
import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n/server";
import type { MsgKey } from "@/lib/i18n";

// Section id, how many points it has, and which reader it is for first.
const SECTIONS: { id: string; n: number }[] = [
  { id: "what", n: 3 },
  { id: "works", n: 4 },
  { id: "teacher", n: 5 },
  { id: "parent", n: 5 },
  { id: "avoid", n: 3 },
  { id: "sleep", n: 2 },
  { id: "stories", n: 1 },
  { id: "when", n: 1 },
];
const SOURCES = ["wolraich", "nice", "pyle", "fabiano", "moore", "paruthi", "gray"];

/** A short ADHD primer with sources, the same for every adult in the team. */
export default async function HelpPage() {
  const user = await requireUser("TEACHER", "PARENT", "PSYCHOLOGIST", "ADMIN");
  const { t } = await getT();
  // The reader's own section comes right after the basics.
  const mine = user.role === "TEACHER" ? "teacher" : user.role === "PARENT" ? "parent" : null;
  const order = mine ? [...SECTIONS.slice(0, 2), SECTIONS.find((s) => s.id === mine)!, ...SECTIONS.slice(2).filter((s) => s.id !== mine)] : SECTIONS;
  return (
    <Shell current="/help">
      <h1>{t("help.title")}</h1>
      <p className="muted">{t("help.lead")}</p>
      <nav className="chips no-print" aria-label={t("nav.sections")}>
        {order.map((s) => <a key={s.id} className="chip" href={`#${s.id}`}>{t(`help.${s.id}.title` as MsgKey)}</a>)}
        <a className="chip" href="#sources">{t("help.sources")}</a>
      </nav>
      {order.map((s) => (
        <section key={s.id} id={s.id} className="card">
          <h2>{t(`help.${s.id}.title` as MsgKey)}</h2>
          {s.n === 1 ? (
            <p>{t(`help.${s.id}.1` as MsgKey)}</p>
          ) : (
            <ul className="stack" style={{ margin: 0, paddingLeft: 20 }}>
              {Array.from({ length: s.n }, (_, i) => <li key={i}>{t(`help.${s.id}.${i + 1}` as MsgKey)}</li>)}
            </ul>
          )}
        </section>
      ))}
      <section id="sources" className="card">
        <h2>{t("help.sources")}</h2>
        <ol className="stack small" style={{ margin: 0, paddingLeft: 20 }}>
          {SOURCES.map((s) => <li key={s}>{t(`help.src.${s}` as MsgKey)}</li>)}
        </ol>
      </section>
    </Shell>
  );
}
