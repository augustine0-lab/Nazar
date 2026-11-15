// Draws the app icons (PNG) from the SVGs in public/icons. Run once after changing the SVG:
//   node scripts/pwa-icons.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const dir = new URL("../public/icons/", import.meta.url);
const jobs = [
  ["icon.svg", "icon-192.png", 192],
  ["icon.svg", "icon-512.png", 512],
  ["maskable.svg", "maskable-512.png", 512],
  ["maskable.svg", "apple-touch-icon.png", 180],
];
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const page = await browser.newPage();
for (const [src, out, size] of jobs) {
  const svg = readFileSync(new URL(src, dir), "utf8");
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: new URL(out, dir).pathname, omitBackground: true });
}
await browser.close();
