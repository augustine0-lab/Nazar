"use client";

import { I } from "@/components/ui/Icon";
import { useI18n } from "@/lib/i18n/client";

export function PrintButton() {
  const { t } = useI18n();
  return (
    <div className="stack no-print">
      <button className="btn primary" type="button" onClick={() => window.print()}><I name="print" /> {t("rp.print")}</button>
      <p className="muted small">{t("rp.printHint")}</p>
    </div>
  );
}
