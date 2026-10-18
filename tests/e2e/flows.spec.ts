import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, login: string, password = "demo1234") {
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("button.primary[type=submit]").click();
  if (password === "demo1234" || password === "123456") await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("teacher marks a lesson and the child sees new stars", async ({ browser }) => {
  const child = await browser.newPage();
  await login(child, "miras", "123456");
  await expect(child.getByRole("heading", { name: "Привет, Мирас!" })).toBeVisible();
  const before = await child.locator(".star.lit").count();

  const teacher = await browser.newPage();
  await login(teacher, "aigul");
  await expect(teacher.getByRole("heading", { name: "Мой класс" })).toBeVisible();
  await teacher.getByRole("link", { name: /Мирас Сейітов/ }).click();
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
  await login(page, "gulnar");
  await expect(page.getByText("Просит:")).toBeVisible();
  await page.getByRole("button", { name: "Выдать" }).first().click();
  await expect(page.getByText("Награда выдана")).toBeVisible();
});

test("psychologist submits a plan and the parent approves it for the next school day", async ({ browser }) => {
  const psych = await browser.newPage();
  await login(psych, "saule");
  await psych.getByRole("link", { name: /Мирас Сейітов/ }).click();
  await expect(psych.getByRole("heading", { name: "Динамика по неделям" })).toBeVisible();
  await psych.locator("#goal-1-adult").fill("Поднимает руку и ждёт, пока спросят");
  await psych.getByRole("button", { name: "Отправить родителю на согласование" }).click();
  await expect(psych.getByText("План отправлен родителю на согласование")).toBeVisible();

  const parent = await browser.newPage();
  await login(parent, "gulnar");
  await parent.getByRole("link", { name: "Посмотреть план" }).click();
  await expect(parent.getByText("Поднимает руку и ждёт, пока спросят")).toBeVisible();
  await parent.getByRole("button", { name: "Согласовать" }).click();
  await expect(parent.getByText(/План согласован и действует с/)).toBeVisible();
});

test("a teacher of another class cannot mark a child without consent", async ({ page }) => {
  await login(page, "nurlan");
  await page.getByRole("link", { name: /Санжар Әлиев/ }).click();
  await expect(page.getByRole("heading", { name: "Отметки недоступны" })).toBeVisible();
});

test("roles cannot open each other's screens", async ({ page }) => {
  await login(page, "miras", "123456");
  await page.goto("/teacher");
  await expect(page).toHaveURL(/\/student$/);
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/student$/);
});

test("wrong password shows a clear message", async ({ page }) => {
  await login(page, "aigul", "nope");
  await expect(page.getByText("Неверный логин или пароль.")).toBeVisible();
});

/* ---------- Kazakh interface ---------- */

const RUSSIAN_UI = /Мой класс|Мои дети|Мой день|Выйти|Награды|Домашка|Сегодня|Карточка поведения|Закрыть день|Динамика по неделям|Согласие на обработку/;

test("the language switch changes the interface and the demo content follows", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("button", { name: "Войти" })).toBeVisible();
  await page.getByRole("button", { name: "Қаз" }).click();
  await expect(page.getByRole("button", { name: "Кіру" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "kk");

  await login(page, "aigul");
  await expect(page.getByRole("heading", { name: "Менің сыныбым" })).toBeVisible();
  await page.getByRole("link", { name: /Мирас Сейітов/ }).click();
  await expect(page.getByText("Мінез-құлық карточкасы", { exact: true })).toBeVisible();
  await expect(page.getByText("Тапсырманы 2 минут ішінде бастайды")).toBeVisible();
  await expect(page.getByRole("button", { name: "Күнді жабу" })).toBeVisible();

  // The choice survives a reload, and Russian is one click away.
  await page.reload();
  await expect(page.getByText("Мінез-құлық карточкасы", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Рус" }).click();
  await expect(page.getByText("Карточка поведения", { exact: true })).toBeVisible();
  await expect(page.getByText("Начинает задание в течение 2 минут")).toBeVisible();
});

test.describe("browser language", () => {
  test.use({ locale: "kk-KZ" });
  test("a browser that prefers Kazakh gets the Kazakh interface at first visit", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: "Кіру" })).toBeVisible();
  });
});

test("Kazakh errors and messages", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Қаз" }).click();
  await login(page, "aigul", "nope");
  await expect(page.getByText("Логин немесе құпиясөз дұрыс емес.")).toBeVisible();
  await login(page, "aigul");
  await page.getByRole("link", { name: /Мирас Сейітов/ }).click();
  await page.getByRole("button", { name: "Жазбаны сақтау" }).click();
  await expect(page.getByText("Жазба сақталды")).toBeVisible();
});

const SCREENS: Record<string, { login: string; password?: string; paths: string[]; follow?: string }> = {
  teacher: { login: "aigul", paths: ["/teacher", "/techniques"], follow: "/teacher" },
  parent: { login: "gulnar", paths: ["/parent", "/parent/rewards", "/parent/homework", "/parent/plan"] },
  student: { login: "miras", password: "123456", paths: ["/student", "/student/rewards"], follow: "/student" },
  psychologist: { login: "saule", paths: ["/psych", "/techniques"], follow: "/psych" },
  admin: { login: "admin", paths: ["/admin"] },
};

for (const lang of ["kk", "ru"] as const) {
  for (const [role, spec] of Object.entries(SCREENS)) {
    test(`${role} screens in ${lang} show no raw keys and no mixed-in Russian`, async ({ page }) => {
      await page.goto("/login");
      await page.getByRole("button", { name: lang === "kk" ? "Қаз" : "Рус" }).click();
      await login(page, spec.login, spec.password);
      const paths = [...spec.paths];
      for (const path of paths) {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const text = await page.locator("body").innerText();
        expect(text, `${path} (${lang})`).not.toContain("@demo.");
        expect(text, `${path} (${lang})`).not.toMatch(/\bundefined\b|\[object|\{\w+\}/);
        if (lang === "kk") expect(text, `${path} (${lang})`).not.toMatch(RUSSIAN_UI);
      }
      if (spec.follow) {
        await page.goto(spec.follow);
        const link = page.locator("a.list-link").first();
        await link.click();
        await page.waitForLoadState("networkidle");
        const text = await page.locator("body").innerText();
        expect(text, `detail page (${lang})`).not.toContain("@demo.");
        if (lang === "kk") expect(text, `detail page (${lang})`).not.toMatch(RUSSIAN_UI);
      }
    });
  }
}
