import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, login: string, password = "demo1234") {
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("the psychologist starts a trial and the teacher sees what to do", async ({ browser }) => {
  const psych = await browser.newPage();
  await login(psych, "saule");
  await psych.getByRole("link", { name: /Мирас/ }).first().click();
  const card = psych.locator("#trial");
  await expect(card.getByText("Прошлые проверки (1)")).toBeVisible();
  await card.getByLabel("Приём").selectOption({ label: "Двигательные паузы" });
  await card.getByLabel("Что именно делаем").fill("Разминка каждые 15 минут");
  await card.getByRole("button", { name: "Начать проверку" }).click();
  await expect(card.getByText("день 1 из 10")).toBeVisible();

  const teacher = await browser.newPage();
  await login(teacher, "aigul");
  await teacher.getByRole("link", { name: /Мирас/ }).click();
  await expect(teacher.getByText("Сейчас проверяем приём")).toBeVisible();
  await expect(teacher.getByText("Разминка каждые 15 минут")).toBeVisible();
});

test("the teacher reads the passport and the parent fills it in", async ({ browser }) => {
  const teacher = await browser.newPage();
  await login(teacher, "aigul");
  await teacher.getByRole("link", { name: /Мирас/ }).click();
  await teacher.getByRole("link", { name: /Паспорт ученика/ }).click();
  await expect(teacher.getByRole("heading", { name: /Паспорт ученика: Мирас/ })).toBeVisible();
  await expect(teacher.locator("article").getByText(/Быстро считает в уме/)).toBeVisible();

  const parent = await browser.newPage();
  await login(parent, "erlan");
  await parent.getByRole("link", { name: /Паспорт ученика/ }).click();
  await parent.getByLabel(/Сильные стороны/).fill("Хорошо рисует");
  await parent.getByRole("button", { name: "Сохранить паспорт" }).click();
  await expect(parent.locator("article").getByText("Хорошо рисует")).toBeVisible();
});

test("the class for everyone shows covered needs and the lesson board runs", async ({ page }) => {
  await login(page, "aigul");
  await page.getByRole("link", { name: "Класс для всех" }).click();
  await expect(page.getByText(/Уже есть у всего класса/).first()).toBeVisible();
  const move = page.getByRole("button", { name: /Движение для всех/ });
  await move.click();
  await expect(move).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.getByRole("button", { name: /Движение для всех/ })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("link", { name: /Экран урока/ }).click();
  await expect(page.locator(".board-now").getByText("Приветствие и план")).toBeVisible();
  await page.getByRole("button", { name: /Дальше/ }).click();
  await expect(page.locator(".board-now").getByText("Устный счёт")).toBeVisible();
});
