import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, login: string, password = "demo1234") {
  await page.goto("/login");
  await page.getByLabel("Логин").fill(login);
  await page.getByLabel("Пароль или PIN").fill(password);
  await page.getByRole("button", { name: "Войти" }).click();
  if (password === "demo1234" || password === "123456") await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("teacher marks a lesson and the child sees new stars", async ({ browser }) => {
  const child = await browser.newPage();
  await login(child, "misha", "123456");
  await expect(child.getByRole("heading", { name: "Привет, Миша!" })).toBeVisible();
  const before = await child.locator(".star.lit").count();

  const teacher = await browser.newPage();
  await login(teacher, "olga");
  await expect(teacher.getByRole("heading", { name: "Мой класс" })).toBeVisible();
  await teacher.getByRole("link", { name: /Миша Соколов/ }).click();
  await teacher.getByRole("button", { name: /3 урок/ }).click();
  const rows = teacher.locator(".goal-row");
  await rows.nth(0).getByRole("button", { name: "Да" }).click();
  await rows.nth(1).getByRole("button", { name: "Да" }).click();
  await rows.nth(2).getByRole("button", { name: "—" }).click();
  await expect(teacher.getByRole("button", { name: /4 урок/ })).toHaveAttribute("aria-pressed", "true");

  await child.reload();
  await expect(child.locator(".star.lit")).toHaveCount(before + 2);
});

test("parent grants the requested reward", async ({ page }) => {
  await login(page, "elena");
  await expect(page.getByText("Просит:")).toBeVisible();
  await page.getByRole("button", { name: "Выдать" }).first().click();
  await expect(page.getByText("Награда выдана")).toBeVisible();
});

test("psychologist submits a plan and the parent approves it for the next school day", async ({ browser }) => {
  const psych = await browser.newPage();
  await login(psych, "natalia");
  await psych.getByRole("link", { name: /Миша Соколов/ }).click();
  await expect(psych.getByRole("heading", { name: "Динамика по неделям" })).toBeVisible();
  await psych.locator("#goal-1-adult").fill("Поднимает руку и ждёт, пока спросят");
  await psych.getByRole("button", { name: "Отправить родителю на согласование" }).click();
  await expect(psych.getByText("План отправлен родителю на согласование")).toBeVisible();

  const parent = await browser.newPage();
  await login(parent, "elena");
  await parent.getByRole("link", { name: "Посмотреть план" }).click();
  await expect(parent.getByText("Поднимает руку и ждёт, пока спросят")).toBeVisible();
  await parent.getByRole("button", { name: "Согласовать" }).click();
  await expect(parent.getByText(/План согласован и действует с/)).toBeVisible();
});

test("a teacher of another class cannot mark a child without consent", async ({ page }) => {
  await login(page, "ivan");
  await page.getByRole("link", { name: /Саша Орлов/ }).click();
  await expect(page.getByRole("heading", { name: "Отметки недоступны" })).toBeVisible();
});

test("roles cannot open each other's screens", async ({ page }) => {
  await login(page, "misha", "123456");
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/student$/);
});

test("wrong password shows a clear message", async ({ page }) => {
  await login(page, "olga", "nope");
  await expect(page.getByText("Неверный логин или пароль.")).toBeVisible();
});
