import { expect, test } from "@playwright/test";

// Chromium's stand-in camera shows a test pattern without a face: the face model must load from Nazar
// itself, look at the frames, and say it cannot see a face. The full look-away-and-back cycle needs a
// real face in front of the camera; see the README for how it was checked.
test.use({
  launchOptions: {
    ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}),
    args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
  },
  permissions: ["camera"],
});

test("the reader turns on «Взгляд», sees what happens to the video, and is told when no face is seen", async ({ page }) => {
  const outside: string[] = [];
  page.on("request", (r) => {
    const u = new URL(r.url());
    if (u.hostname !== "localhost") outside.push(u.href);
  });

  await page.goto("/login");
  await page.locator("#login").fill("miras");
  await page.locator("#password").fill("123456");
  await page.locator("form button.primary[type=submit]").click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
  await page.goto("/student/read");
  await page.getByRole("link", { name: /Путешествие капли/ }).click();

  await page.getByRole("button", { name: "👁 Взгляд" }).click();
  await expect(page.getByText("Видео не записывается и не покидает это устройство")).toBeVisible();
  await expect(page.getByText("Nazar не считает отвлечения и ничего не сохраняет")).toBeVisible();
  await page.getByRole("button", { name: "Включить камеру" }).click();
  await expect(page.getByText("Посмотри на точку")).toBeVisible({ timeout: 60_000 });
  await expect(page.locator(".gz-panel [role=alert]")).toHaveText(/Не вижу лица/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: "Попробовать ещё раз" })).toBeVisible();

  // The camera is off again, and nothing went to another site.
  expect(await page.locator("video.gz-video").evaluate((v: HTMLVideoElement) => v.srcObject)).toBeNull();
  expect(outside).toEqual([]);
});
