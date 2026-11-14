import { expect, test, type Browser, type Page } from "@playwright/test";

// Chromium's fake camera and microphone: real WebRTC video between two browser windows, no devices needed.
test.use({ launchOptions: { args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"], ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) } });

async function open(browser: Browser, login: string, password = "demo1234"): Promise<Page> {
  const ctx = await browser.newContext({ permissions: ["camera", "microphone"], locale: "ru-RU" });
  const page = await ctx.newPage();
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

const tile = (page: Page, name: string) => page.locator("article.room-tile").filter({ hasText: name });

test("a pupil waits for the teacher, then they see each other by video", async ({ browser }) => {
  const kid = await open(browser, "miras", "123456");
  await kid.goto("/room");
  await expect(kid.getByRole("button", { name: "Войти в комнату" })).toBeDisabled();
  await expect(kid.getByText("Комната пока закрыта").first()).toBeVisible();

  const teacher = await open(browser, "aigul");
  await teacher.goto("/room");
  await expect(teacher.getByText(/Комнату включили родители 2 из 2 учеников. Без взрослого согласны 1 из 2/)).toBeVisible();
  await teacher.getByRole("button", { name: "Открыть комнату и вести" }).click();
  await expect(tile(teacher, "Айгүл")).toBeVisible();

  // The room opens for the pupil as soon as the adult is there.
  await kid.getByText("📖 чтение").click();
  await kid.getByRole("button", { name: "Войти в комнату" }).click();
  await expect(tile(kid, "Айгүл")).toBeVisible();
  await expect(tile(teacher, "Мирас")).toContainText("чтение");
  await expect(tile(teacher, "Мирас")).toContainText("камера выключена");

  await kid.getByRole("button", { name: /Включить камеру/ }).click();
  const remote = tile(teacher, "Мирас").locator("video");
  await expect(remote).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => remote.evaluate((v: HTMLVideoElement) => v.videoWidth), { timeout: 20_000 }).toBeGreaterThan(0);

  await teacher.getByRole("button", { name: "15 мин" }).click();
  await expect(kid.locator(".room-timer .big")).toHaveText(/1[45]:\d\d/);
  await expect(kid.getByRole("button", { name: "15 мин" })).toHaveCount(0);

  // The adult turns the camera off; the child stays in the room.
  await teacher.getByRole("button", { name: "Выключить камеру: Мирас" }).click();
  await expect(kid.getByText("Ведущий выключил твою камеру")).toBeVisible();
  await expect(tile(teacher, "Мирас")).toContainText("камера выключена");

  await teacher.getByRole("button", { name: "Выйти из комнаты" }).click();
  await expect(kid.getByText(/Ведущий вышел, и комната закрылась/)).toBeVisible();
  await expect(kid.getByRole("button", { name: "Войти в комнату" })).toBeDisabled();
});

test("the parent turns the room off and the child leaves it at once", async ({ browser }) => {
  const teacher = await open(browser, "aigul");
  await teacher.goto("/room");
  await teacher.getByRole("button", { name: "Открыть комнату и вести" }).click();
  const kid = await open(browser, "aliya", "123456");
  await kid.goto("/room");
  await kid.getByRole("button", { name: "Войти в комнату" }).click();
  await expect(tile(teacher, "Алия")).toBeVisible();

  const parent = await open(browser, "erlan");
  const card = parent.locator("#room");
  await expect(card.getByText("Сейчас включено, с камерой.")).toBeVisible();
  await card.getByLabel(/Разрешить Алия заходить/).uncheck();
  await card.getByRole("button", { name: "Сохранить" }).click();
  await expect(card.getByText("Сейчас выключено.")).toBeVisible();

  await expect(kid.getByText("Родитель выключил Тихую комнату.")).toBeVisible();
  await expect(tile(teacher, "Алия")).toHaveCount(0);
  await kid.reload();
  await expect(kid.getByText(/Попроси маму или папу/)).toBeVisible();
});
