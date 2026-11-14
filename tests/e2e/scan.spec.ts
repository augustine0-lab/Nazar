import { expect, test, type Page } from "@playwright/test";

// Chromium's stand-in camera shows a test pattern with no school things in it: the detector must load from
// Nazar itself and look, the camera must go off again, and no request may leave for another site.
// Finding a real thing needs a real camera; see the README for how that was checked.
test.use({
  launchOptions: {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["camera"],
});

async function login(page: Page, login: string, password = "demo1234") {
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("the child shows the bag to the robot, which looks only for the things it knows", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).hostname !== "localhost") outside.push(r.url());
  });
  await login(page, "miras", "123456");

  // Another test may have packed the whole bag already: take the water and the scissors out again.
  for (const title of ["Бутылка воды", "Ножницы для труда"]) {
    const line = page.getByRole("button", { name: `Положил: ${title}` });
    if ((await line.getAttribute("aria-pressed")) === "true") await line.click();
    await expect(line).toHaveAttribute("aria-pressed", "false");
  }

  await page.getByRole("button", { name: "📷 Покажи роботу" }).click();
  await expect(page.getByText("Робот узнаёт: Учебники по расписанию, Бутылка воды, Ножницы для труда.")).toBeVisible();
  await expect(page.getByText("Остальное отметь сам.")).toBeVisible();
  await expect(page.getByText("Видео не записывается и не уходит с устройства")).toBeVisible();

  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("Ищу: Бутылка воды, Ножницы для труда")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Готово" }).click();
  await expect(page.getByRole("button", { name: "📷 Покажи роботу" })).toBeVisible();
  expect(await page.locator(".scan-view video").count()).toBe(0);
  expect(outside).toEqual([]);
});

test("the parent sees which lines of the bag list the camera can recognise", async ({ page }) => {
  await login(page, "gulnar");
  await page.goto("/parent/schedule");
  await expect(page.getByText("«Сканер рюкзака» узнаёт учебники и тетради")).toBeVisible();
  const lines = page.locator(".bag-edit", { hasText: "📷 узнаёт камера" });
  await expect(lines).toHaveCount(3);
  await expect(page.locator(".bag-edit", { hasText: "Дневник" })).not.toContainText("📷");
});
