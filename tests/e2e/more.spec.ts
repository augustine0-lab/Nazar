import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, login: string, password = "demo1234") {
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("show mode logs in as any role with one click", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: /Режим показа/ }).click();
  await page.getByRole("button", { name: /gulnar/ }).click();
  await page.waitForURL(/\/parent/);
  await expect(page.getByRole("heading", { name: "Мирас Сейітов" })).toBeVisible();
});

test("the child packs the bag and the parent is told", async ({ browser }) => {
  const child = await browser.newPage();
  await login(child, "miras", "123456");
  const bag = child.locator(".sched.bag");
  const open = bag.locator(".sched-item[aria-pressed=false]");
  const n = await open.count();
  expect(n).toBeGreaterThan(0);
  for (let i = 0; i < n; i++) {
    const label = await open.first().getAttribute("aria-label");
    await child.getByRole("button", { name: label! }).click();
    await expect(child.getByRole("button", { name: label! })).toHaveAttribute("aria-pressed", "true");
  }
  await expect(child.getByText("Рюкзак собран!")).toBeVisible();

  const parent = await browser.newPage();
  await login(parent, "gulnar");
  await parent.goto("/notifications");
  await expect(parent.getByText("Рюкзак на завтра собран: Мирас Сейітов")).toBeVisible();
});

test("the child reads a social story step by step", async ({ page }) => {
  await login(page, "miras", "123456");
  await page.getByRole("link", { name: "Истории" }).first().click();
  await page.getByRole("link", { name: /Когда я злюсь/ }).click();
  await expect(page.getByText("Шаг 1 из 5")).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole("button", { name: "Дальше" }).click();
  await expect(page.getByText("Готово! Теперь ты знаешь, что делать.")).toBeVisible();
});

test("a parent writes a story and the child sees it", async ({ browser }) => {
  const parent = await browser.newPage();
  await login(parent, "gulnar");
  await parent.getByRole("link", { name: "Истории для ребёнка" }).click();
  await parent.getByLabel("Название").fill("Идём в гости");
  await parent.getByLabel("Шаги, по одному в строке").fill("🚗 | Едем к бабушке\n🤝 | Здороваюсь\n😊 | Играю тихо");
  await parent.getByRole("button", { name: "Добавить историю" }).click();
  await expect(parent.getByText("История добавлена")).toBeVisible();

  const child = await browser.newPage();
  await login(child, "miras", "123456");
  await child.goto("/student/stories");
  await child.getByRole("link", { name: /Идём в гости/ }).click();
  await expect(child.getByText("Едем к бабушке")).toBeVisible();
});

test("the parent sets a big goal, writes the sleep diary, reads the week and downloads the data", async ({ page }) => {
  await login(page, "gulnar");
  await page.goto("/parent/rewards");
  await page.getByLabel("Большая цель").selectOption({ label: "Поход в парк с папой · ★ 12" });
  await page.getByRole("button", { name: "Сохранить цель" }).click();
  await expect(page.getByText("Большая цель сохранена")).toBeVisible();

  await page.goto("/parent/health");
  await page.getByLabel("Сон ночью, часов").fill("9.5");
  await page.getByLabel("Лекарство").selectOption("NONE");
  await page.getByRole("button", { name: "Записать" }).click();
  await expect(page.getByText("Запись сохранена")).toBeVisible();
  await expect(page.getByText("Сон и школьный день")).toBeVisible();

  await page.goto("/parent/week");
  await expect(page.getByRole("heading", { name: "Цели недели" })).toBeVisible();
  await page.getByRole("link", { name: /Предыдущая/ }).click();
  await expect(page.getByText("На прошлой неделе:").first()).toBeVisible();

  await page.goto("/parent/plan");
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: /Скачать данные/ }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^nazar-.*\.json$/);
});

test("the child sees the big goal the parent chose", async ({ page }) => {
  await login(page, "miras", "123456");
  await expect(page.getByRole("heading", { name: /Коплю на: Поход в парк с папой/ })).toBeVisible();
});

test("a teacher proposes a goal, the psychologist takes it into the plan", async ({ browser }) => {
  const teacher = await browser.newPage();
  await login(teacher, "aigul");
  await teacher.getByRole("link", { name: /Алия Қасымова/ }).click();
  await teacher.getByText("Предложить цель психологу").click();
  await teacher.getByLabel("Цель для взрослых").fill("Поднимает руку перед ответом");
  await teacher.getByLabel("Как сказать ребёнку").fill("Сначала рука");
  await teacher.getByRole("button", { name: "Отправить психологу" }).click();
  await expect(teacher.getByText("Предложение отправлено психологу")).toBeVisible();

  const psych = await browser.newPage();
  await login(psych, "saule");
  await psych.getByRole("link", { name: /Алия Қасымова/ }).click();
  const box = psych.locator(".proposals");
  await expect(box.getByText("Поднимает руку перед ответом")).toBeVisible();
  // Aliya's pending plan has three goals, so there is room for one more.
  await box.getByRole("button", { name: "В план" }).click();
  await expect(psych.locator("#goal-3-adult")).toHaveValue("Поднимает руку перед ответом");
  await psych.getByRole("button", { name: "Отправить родителю на согласование" }).click();
  await expect(psych.getByText("План отправлен родителю на согласование").first()).toBeVisible();

  await teacher.reload();
  await teacher.getByText("Предложить цель психологу").click();
  await expect(teacher.getByText("взято в план")).toBeVisible();
});

test("the teacher cannot open the sleep diary or download the data", async ({ page }) => {
  await login(page, "aigul");
  await page.goto("/parent/health");
  await expect(page).toHaveURL(/\/teacher/);
  const ids = await page.locator('a[href^="/teacher/student/"]').first().getAttribute("href");
  const res = await page.request.get(`/api/export/${ids!.split("/").pop()}`);
  expect(res.status()).toBe(403);
});

test("e-mail settings are saved in the profile", async ({ page }) => {
  await login(page, "erlan");
  await page.getByRole("link", { name: "Профиль" }).click();
  await page.getByLabel("Адрес почты").fill("erlan@example.kz");
  await page.getByLabel("Присылать уведомления на почту").check();
  await page.getByRole("button", { name: "Сохранить" }).click();
  await expect(page.getByText("Настройки почты сохранены")).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Адрес почты")).toHaveValue("erlan@example.kz");
});

test("the help page has sources", async ({ page }) => {
  await login(page, "aigul");
  await page.getByRole("link", { name: "Справка" }).click();
  await expect(page.getByRole("heading", { name: "Учителю" })).toBeVisible();
  await expect(page.getByText(/Wolraich/)).toBeVisible();
});

// Last on purpose: it puts the demo school back to its start.
test("the demo reset brings back the starting data", async ({ page }) => {
  await page.goto("/demo");
  await page.getByRole("button", { name: /Вернуть демо-данные к началу/ }).click();
  await expect(page.getByText("Демо-данные вернулись к началу")).toBeVisible();
  await page.getByRole("button", { name: /miras/ }).click();
  await page.waitForURL(/\/student/);
  await expect(page.getByRole("heading", { name: /Коплю на: Поход в кино всей семьёй/ })).toBeVisible();
});
