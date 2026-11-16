import { expect, test, type Page } from "@playwright/test";

// AI help for adults. The e2e server has no Gemini key, so every answer comes from Nazar's own rules:
// the screens, the gates and the journal are the same as with the key.
async function login(page: Page, login: string) {
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill("demo1234");
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

async function openMiras(page: Page) {
  await page.goto("/teacher");
  await page.locator(".list-link", { hasText: "Мирас" }).first().click();
  await page.waitForURL(/\/teacher\/student\//);
  return page.url().split("/").pop()!;
}

test("a teacher softens a note and turns a typed note into marks", async ({ page }) => {
  await login(page, "aigul");
  await openMiras(page);

  await page.locator("#note").fill("Опять сорвал урок и мешал соседям!!");
  await page.getByRole("button", { name: "Сказать мягче" }).first().click();
  const soft = page.getByTestId("ai-soften-result");
  await expect(soft).toContainText("Пример без ИИ");
  await soft.locator(".ai-option").first().click();
  await expect(page.locator("#note")).toHaveValue(/трудно усидеть/);

  await page.getByText("Отметить голосом").click();
  await page.locator("#ai-voice-text").fill("Руку поднимал, но дважды вставал с места.");
  await page.getByRole("button", { name: "Предложить отметки" }).click();
  const voice = page.getByTestId("ai-voice-result");
  await expect(voice.locator("li")).not.toHaveCount(0);
  await voice.getByRole("button", { name: "Поставить отметки" }).click();
  await expect(page.getByText("Отметки поставлены.")).toBeVisible();
});

test("a psychologist drafts a story, a parent sees the permission, the admin sees the journal", async ({ page }) => {
  await login(page, "aigul");
  const miras = await openMiras(page);
  await page.locator("#note").fill("Мирас мешал");
  await page.getByRole("button", { name: "Сказать мягче" }).first().click();
  await expect(page.getByTestId("ai-soften-result")).toBeVisible();

  await page.context().clearCookies();
  await login(page, "saule");
  await page.goto(`/stories/${miras}`);
  await page.locator("#ai-situation").fill("контрольная в новом кабинете");
  await page.getByRole("button", { name: "Написать черновик" }).click();
  await expect(page.locator("#story-title")).toHaveValue("Контрольная в новом кабинете");
  await expect(page.locator("#story-steps")).toHaveValue(/📅 \| Скоро будет вот что/);

  await page.context().clearCookies();
  await login(page, "gulnar");
  await page.goto("/parent/plan");
  await expect(page.getByText("ИИ-помощь разрешена")).toBeVisible();

  await page.context().clearCookies();
  await login(page, "admin");
  await page.goto("/admin");
  await expect(page.getByRole("heading", { name: /ИИ-помощь/ })).toBeVisible();
  await expect(page.getByText(/Ключа Gemini|ключа Gemini/).first()).toBeVisible();
  await page.getByText("Журнал запросов").click();
  await expect(page.locator("table", { hasText: "Сказать мягче" }).first()).toBeVisible();
});
