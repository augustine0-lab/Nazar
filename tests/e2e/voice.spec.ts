import { expect, test, type Page } from "@playwright/test";

// The demo living text comes with its own voice in Russian and Kazakh: the words light up in step with it,
// the reader steps one sentence back, changes the speed, shows captions, and comes back to the same place.
async function openWater(page: Page) {
  await page.goto("/login");
  await page.locator("#login").fill("miras");
  await page.locator("#password").fill("123456");
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/student/read");
  await page.getByRole("link", { name: /Путешествие капли/ }).click();
  await expect(page.getByRole("heading", { name: "В тёплом море" })).toBeVisible();
}

test("the demo text is read by its own voice, word by word", async ({ page }) => {
  await openWater(page);
  const audio = page.locator("audio");
  await expect(audio).toHaveAttribute("src", "/voice/water/ru/1.mp3");
  // A recording means the browser's voice is not needed.
  await expect(page.getByRole("button", { name: /Послушать/ })).toHaveCount(0);

  await page.getByRole("radio", { name: "Медленнее" }).click();
  await expect(page.getByRole("radio", { name: "Медленнее" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Субтитры" }).click();
  await page.getByRole("button", { name: "Слушать и читать" }).click();

  // The voice plays and a word lights up, in the text and in the captions.
  await expect.poll(() => audio.evaluate((a: HTMLAudioElement) => a.currentTime), { timeout: 15_000 }).toBeGreaterThan(2.5);
  expect(await audio.evaluate((a: HTMLAudioElement) => a.playbackRate)).toBe(0.75);
  await expect(page.locator(".lt-text .w.now")).toHaveCount(1);
  await expect(page.locator(".lt-cc .w.now")).toHaveCount(1);

  // Forward one sentence: the second sentence is the one being read now.
  await page.getByRole("button", { name: "Пауза" }).click();
  await page.getByRole("button", { name: /Фраза вперёд/ }).click();
  await expect(page.locator(".lt-text .s.now")).toContainText("Солнце светило ярко");
  await page.getByRole("button", { name: /Фраза назад/ }).click();
  await page.getByRole("button", { name: /Фраза назад/ }).click();
  await expect(page.locator(".lt-text .s.now")).toContainText("Жила-была капля");

  // Reading without the voice keeps the place.
  await page.getByRole("button", { name: /Фраза вперёд/ }).click();
  await page.getByRole("button", { name: "Голос", exact: true }).click();
  await expect(page.locator("audio")).toHaveCount(0);
  await expect(page.locator(".lt-text .s.now")).toContainText("Солнце светило ярко");
  await page.getByRole("button", { name: "Без голоса" }).click();

  // Next chapter, then come back later: Nazar offers to go on from there.
  await page.getByRole("button", { name: /Дальше/ }).click();
  await page.getByRole("button", { name: /Фраза вперёд/ }).click();
  await page.reload();
  await expect(page.getByText("Ты остановился(-ась) на главе 2 «Капля в облаке».")).toBeVisible();
  await expect(page.getByRole("radio", { name: "Медленнее" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page.getByRole("heading", { name: "Капля в облаке" })).toBeVisible();
  await expect(page.locator(".lt-text .s.now")).toContainText("Капля встретила много других капель");
});

test("in Kazakh the voice is Kazakh too", async ({ page }) => {
  await page.context().addCookies([{ name: "nazar_lang", value: "kk", url: "http://localhost:3100" }]);
  await page.goto("/login");
  await page.locator("#login").fill("miras");
  await page.locator("#password").fill("123456");
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/student/read");
  await page.getByRole("link", { name: /Тамшының саяхаты/ }).click();
  await expect(page.locator("audio")).toHaveAttribute("src", "/voice/water/kk/1.mp3");
  const ok = await page.evaluate(async () => (await fetch("/voice/water/kk/1.mp3")).headers.get("content-type"));
  expect(ok).toContain("audio/mpeg");
});
