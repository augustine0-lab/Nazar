import type { MetadataRoute } from "next";
import { getT } from "@/lib/i18n/server";

/**
 * The web app manifest: what the phone needs to install Nazar on the home screen.
 * The texts follow the reader's language, so a Kazakh-speaking family gets the Kazakh description in the install
 * dialog. Browsers usually fetch the manifest without cookies, so in practice this is the browser's language.
 */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { t, lang } = await getT();
  return {
    id: "/",
    name: `Nazar · ${t("app.tagline")}`,
    short_name: "Nazar",
    description: t("app.description"),
    lang: lang === "kk" ? "kk" : "ru",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "any",
    background_color: "#f6f5fb",
    theme_color: "#5a4fd8",
    categories: ["education", "kids", "productivity"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
}
