import type { Lang, T } from "@/lib/i18n";
import * as D from "@/lib/domain";
import type { recapOf } from "./wow-services";

/** The stories with demo content and dates in the reader's language. */
export function recapView(r: Awaited<ReturnType<typeof recapOf>>, { t, L, lang }: { t: T; L: (s: string) => string; lang: Lang }) {
  const range = { from: D.formatDate(r.period.from, lang), to: D.formatDate(r.period.to, lang) };
  return {
    period: r.period.kind === "quarter" ? t("rc.periodQ", { n: r.period.n, ...range }) : t("rc.periodW", range),
    slides: r.slides.map((s) => (s.kind === "growth" ? { ...s, text: L(s.text) } : s.kind === "pet" ? { ...s, name: L(s.name) } : s)),
    goals: r.goals.map((g) => ({ id: g.id, text: L(g.text) })),
  };
}
