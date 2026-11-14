import { expect, test, type Browser, type Page } from "@playwright/test";

async function open(browser: Browser, login: string, password = "demo1234"): Promise<Page> {
  const page = await (await browser.newContext({ locale: "ru-RU" })).newPage();
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  return page;
}

async function mirasCard(teacher: Page) {
  await teacher.goto("/teacher");
  await teacher.locator("a.list-link", { hasText: "Мирас" }).click();
  await teacher.waitForURL(/\/teacher\/student\//);
}

test("the dice picks a first step and promises only two minutes", async ({ browser }) => {
  const kid = await open(browser, "miras", "123456");
  await kid.getByRole("button", { name: "Не знаю, с чего начать" }).click();
  await expect(kid.getByText("Кубик выбрал")).toBeVisible();
  await kid.getByRole("link", { name: "Начать" }).click();
  await expect(kid).toHaveURL(/start=1/);
  await expect(kid.getByText("Только 2 минуты")).toBeVisible();
});

test("a child offers a deal, the parent who set the task counters, the child agrees", async ({ browser }) => {
  const kid = await open(browser, "miras", "123456");
  await kid.getByRole("link", { name: /Упражнение 87/ }).click();
  await kid.getByText("Предложить свой вариант").click();
  await kid.getByLabel(/нарисую схему или комикс/).check();
  await kid.getByRole("button", { name: "Отправить" }).click();
  await expect(kid.getByText("ждёт ответа")).toBeVisible();

  const mom = await open(browser, "gulnar");
  await mom.goto("/parent/homework");
  const offer = mom.locator("form.deal-answer", { hasText: "нарисую схему" });
  await offer.locator("select[name=counter]").selectOption("SPLIT");
  await offer.getByRole("button", { name: "Предложить своё" }).click();
  await expect(mom.locator("form.deal-answer", { hasText: "нарисую схему" })).toHaveCount(0);

  await kid.reload();
  await expect(kid.getByText("Взрослый предлагает:")).toBeVisible();
  await kid.getByRole("button", { name: "Согласен" }).click();
  await expect(kid.locator(".deal .pill", { hasText: "сделка" })).toBeVisible();
});

test("the teacher sees the evening over the norm and moves the child to another desk", async ({ browser }) => {
  const teacher = await open(browser, "aigul");
  await mirasCard(teacher);
  await expect(teacher.getByText("Потолок домашки")).toBeVisible();
  await expect(teacher.getByText("выше нормы").first()).toBeVisible();
  await teacher.getByRole("button", { name: "Принять" }).click();
  await expect(teacher.getByText("Договорились!")).toBeVisible();

  await teacher.getByRole("link", { name: /Где мне сидится/ }).click();
  await expect(teacher.getByText("На новом месте")).toBeVisible();
  await teacher.getByRole("button", { name: /Ряд 3, место 3\. Пересадить сюда/ }).click();
  await expect(teacher.getByRole("button", { name: /Ряд 3, место 3.*Сидит здесь сейчас/ })).toBeVisible();
});

test("the child starts the sound experiment and the parent sees the result", async ({ browser }) => {
  const kid = await open(browser, "miras", "123456");
  await kid.getByRole("link", { name: /Упражнение 87/ }).click();
  await expect(kid.getByText("Похоже, со звуком тебе легче держаться за дело.")).toBeVisible();
  await kid.getByRole("button", { name: "Включить" }).click();
  await expect(kid.getByRole("button", { name: "Выключить" })).toBeVisible();

  const mom = await open(browser, "gulnar");
  await mom.goto("/parent/homework");
  await expect(mom.getByText("Со звуком ребёнок чаще отвечает, что занят делом.")).toBeVisible();
  await mom.getByRole("button", { name: "30 мин" }).first().click();
  await expect(mom.getByRole("button", { name: "30 мин", pressed: true }).first()).toBeVisible();
});
