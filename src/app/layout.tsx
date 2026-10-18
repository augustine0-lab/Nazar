import type { Metadata, Viewport } from "next";
// Fonts are served from our own server: children's browsers make no requests to third parties.
import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/golos-text/700.css";
import "@fontsource/unbounded/500.css";
import "@fontsource/unbounded/700.css";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/client";
import { dictionary } from "@/lib/i18n";
import { getLang, getT } from "@/lib/i18n/server";
import { getPrefs } from "@/lib/prefs-server";
import { prefsAttributes } from "@/lib/prefs";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: t("app.name"), description: t("app.description") };
}

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = await getLang();
  const prefs = await getPrefs();
  return (
    <html lang={lang} {...prefsAttributes(prefs)}>
      <body>
        <I18nProvider lang={lang} messages={dictionary(lang)}>{children}</I18nProvider>
      </body>
    </html>
  );
}
