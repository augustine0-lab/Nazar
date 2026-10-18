import { defineConfig } from "@playwright/test";

const PORT = 3100;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "ru-RU",
    // Set CHROMIUM_PATH to use an already installed browser instead of `npx playwright install`.
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: `npm run db:seed && npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    env: { DATABASE_PATH: "./data/e2e.db", DEMO_MODE: "on" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
