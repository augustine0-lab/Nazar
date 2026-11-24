import { expect, test, type Page } from "@playwright/test";

// Chromium's stand-in camera and microphone: a test pattern with no things on it, and a beeping tone.
test.use({
  launchOptions: {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["camera", "microphone"],
});

async function login(page: Page, login: string, password = "demo1234") {
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function firstHomework(page: Page) {
  await page.goto("/student");
  await page.locator("a.list-link[href^='/student/homework/']").first().click();
  await page.waitForURL(/\/student\/homework\//);
}

test("«Надуй шарик»: five long presses of the button fill the balloon", async ({ page }) => {
  await login(page, "miras", "123456");
  await page.goto("/student/calm");
  await page.getByRole("button", { name: "Без микрофона: держать кнопку" }).click();
  const hold = page.getByRole("button", { name: "Держу, пока выдыхаю" });
  const box = (await hold.boundingBox())!;
  // A short press is not a breath.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(page.getByText("Слишком быстро. Дуй дольше и медленнее")).toBeVisible();
  for (let k = 0; k < 5; k++) {
    await page.mouse.down();
    await page.waitForTimeout(2800);
    await page.mouse.up();
    await page.waitForTimeout(150);
  }
  await expect(page.getByText("Шарик улетел! Ты спокоен, можно начинать")).toBeVisible();
  await expect(page.getByRole("img", { name: "Шарик надут: 5 из 5 выдохов" })).toBeVisible();
});

test("«Чистый стол»: an empty desk starts the timer by itself, and no request leaves Nazar", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).hostname !== "localhost") outside.push(r.url());
  });
  await login(page, "miras", "123456");
  await firstHomework(page);
  await expect(page.getByText("Перед стартом")).toBeVisible();
  await page.getByRole("button", { name: "Проверить стол" }).click();
  await expect(page.getByText("Видео не записывается и не уходит с устройства")).toBeVisible();
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("Стол чистый! Запускаю таймер")).toBeVisible({ timeout: 60_000 });
  await expect(page.getByRole("button", { name: "Пауза" })).toBeVisible();
  await expect(page.getByText("Перед стартом")).toHaveCount(0);
  expect(await page.locator(".scan-view video").count()).toBe(0);
  expect(outside).toEqual([]);
});

test("«Каракули»: the child draws while listening, and the drawing stays with the chapter", async ({ page }) => {
  await login(page, "miras", "123456");
  await page.goto("/student/read");
  await page.locator("a[href^='/student/read/']").first().click();
  await page.waitForURL(/\/student\/read\//);
  await page.getByRole("button", { name: "Каракули" }).click();
  const sheet = page.getByRole("img", { name: "Лист для каракуль" });
  const box = (await sheet.boundingBox())!;
  await page.mouse.move(box.x + 40, box.y + 40);
  await page.mouse.down();
  await page.mouse.move(box.x + 160, box.y + 120, { steps: 8 });
  await page.mouse.up();
  const kept = await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith("nazar.doodle.")));
  expect(kept).toHaveLength(1);
  await expect(page.getByRole("button", { name: "Новый лист" })).toBeEnabled();
});

test("«Инструкция, которая не улетает» and «Светофор тишины» on the lesson board", async ({ page }) => {
  await login(page, "aigul");
  await page.goto("/teacher/board");
  await page.getByRole("button", { name: "Инструкция на доске" }).click();
  await expect(page.getByText("Здесь появятся пункты задания.")).toBeVisible();
  const field = page.getByRole("textbox", { name: "Пункт задания" });
  await field.fill("так, откройте учебник на с. 42.");
  await field.press("Enter");
  await field.fill("Решите № 3 и № 5");
  await page.getByRole("button", { name: "Добавить пункт" }).click();
  const pins = page.locator(".cap-pins li");
  await expect(pins).toHaveCount(2);
  await expect(pins.first()).toContainText("Откройте учебник на с. 42");
  await pins.first().locator(".cap-pin").click();
  await expect(pins.first().locator(".cap-pin")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await page.getByRole("button", { name: "Инструкция на доске" }).click();
  await expect(page.locator(".cap-pins li")).toHaveCount(2);
  await page.getByRole("button", { name: "Очистить доску" }).click();
  await expect(page.locator(".cap-pins li")).toHaveCount(0);

  await page.getByRole("button", { name: "Светофор тишины" }).click();
  await expect(page.getByText("Включите, и дерево класса начнёт расти")).toBeVisible();
  await page.getByRole("button", { name: "Слушать класс" }).click();
  await expect(page.locator(".qt-note")).toHaveText(/Дерево растёт|ждёт тишины/);
  await page.getByRole("button", { name: "Не слушать" }).click();
});

test("«Моя четверть в сторис»: the child watches, picks a goal, and the mother is told", async ({ browser }) => {
  const child = await browser.newPage();
  await login(child, "miras", "123456");
  await child.getByRole("link", { name: /Моя четверть в сторис/ }).click();
  await expect(child.getByText("Мирас, это твоя четверть!")).toBeVisible();
  await child.getByRole("button", { name: "Дальше" }).click();
  await expect(child.getByText("звёзд ты заработал")).toBeVisible();
  for (let k = 0; k < 12 && (await child.getByRole("button", { name: "Дальше" }).count()); k++) await child.keyboard.press("ArrowRight");
  await expect(child.getByText("Что берём в следующую четверть?")).toBeVisible();
  await child.locator(".rc-goals .btn").first().click();
  await expect(child.getByText(/Записал!/)).toBeVisible();

  const mother = await browser.newPage();
  await login(mother, "gulnar");
  await mother.goto("/notifications");
  await expect(mother.getByText(/выбрал цель на следующую четверть/).first()).toBeVisible();
  await mother.goto("/parent/week");
  await mother.getByRole("link", { name: "Четверть в сторис" }).click();
  await expect(mother.getByText("Мирас, это твоя четверть!")).toBeVisible();
});

test("«Карта трудных минут»: the psychologist sees the hard Monday lessons and the notes behind them", async ({ page }) => {
  await login(page, "saule");
  await page.getByRole("link", { name: /Мирас/ }).first().click();
  const card = page.locator("#hard");
  await expect(card.getByRole("heading", { name: "Карта трудных минут" })).toBeVisible();
  await expect(card.getByText(/Труднее всего: Пн, [45]-й урок/)).toBeVisible();
  await card.locator(".hm-cell.hard").click();
  await expect(card.locator(".hm-pick")).toContainText("Пн");
  await card.getByRole("radio", { name: /После сна меньше 9 часов/ }).click();
  await expect(card.getByRole("radio", { name: /После сна меньше 9 часов/ })).toHaveAttribute("aria-checked", "true");
});
