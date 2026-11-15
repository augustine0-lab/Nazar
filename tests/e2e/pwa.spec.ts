import { expect, test, type Page } from "@playwright/test";

async function login(page: Page, login: string, password = "demo1234") {
  await page.goto("/login");
  await page.locator("#login").fill(login);
  await page.locator("#password").fill(password);
  await page.locator("#password").press("Enter");
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

test("Nazar can be installed: manifest, icons, service worker", async ({ page, request }) => {
  const res = await request.get("/manifest.webmanifest", { headers: { "accept-language": "kk-KZ,kk;q=0.9" } });
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m.short_name).toBe("Nazar");
  expect(m.display).toBe("standalone");
  expect(m.start_url).toBe("/");
  expect(m.lang).toBe("kk");
  expect(m.description).toContain("оқушы");
  for (const icon of m.icons) expect((await request.get(icon.src)).ok(), icon.src).toBe(true);
  expect(m.icons.some((i: { purpose: string }) => i.purpose === "maskable")).toBe(true);

  const sw = await request.get("/sw.js");
  expect(sw.headers()["cache-control"]).toContain("no-cache");

  await page.goto("/login");
  await expect(page.locator('link[rel="manifest"]')).toHaveCount(1);
  await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1);
  const active = await page.evaluate(async () => (await navigator.serviceWorker.ready).active?.scriptURL);
  expect(active).toContain("/sw.js");
});

test("without internet a page shows the offline screen, never an old copy with a child's data", async ({ page, context }) => {
  await login(page, "gulnar");
  await page.evaluate(async () => navigator.serviceWorker.ready);
  await page.reload(); // the page is now controlled by the service worker
  await expect(page.getByRole("heading", { name: "Мирас Сейітов" })).toBeVisible();
  await context.setOffline(true);
  await expect(page.locator(".net-note")).toContainText("Нет интернета");
  await page.goto("/parent").catch(() => undefined);
  await expect(page.getByRole("heading", { name: "Нет связи с интернетом" })).toBeVisible();
  await expect(page.getByText("Мирас Сейітов")).toHaveCount(0);
  const cached = await page.evaluate(async () => {
    const urls: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) urls.push(new URL(r.url).pathname);
    return urls;
  });
  expect(cached.filter((u) => u.startsWith("/parent") || u.startsWith("/api"))).toEqual([]);
  await context.setOffline(false);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true });

  for (const [who, password, pages] of [
    ["gulnar", "demo1234", ["/parent", "/parent/week", "/chat", "/help"]],
    ["aigul", "demo1234", ["/teacher", "/teacher/class", "/room"]],
    ["saule", "demo1234", ["/psych", "/room"]],
    ["miras", "123456", ["/student", "/student/read", "/room"]],
  ] as const) {
    test(`${who}: nothing is wider than the screen and the top bar is one line`, async ({ page }) => {
      await login(page, who, password);
      for (const url of pages) {
        await page.goto(url);
        const { scroll, width, rows } = await page.evaluate(() => {
          const tops = new Set([...document.querySelectorAll(".who > *")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => Math.round(e.getBoundingClientRect().top / 10)));
          return { scroll: document.documentElement.scrollWidth, width: document.documentElement.clientWidth, rows: tops.size };
        });
        expect(scroll, url).toBeLessThanOrEqual(width);
        expect(rows, url).toBeLessThanOrEqual(1);
      }
      // The open section is visible in the sideways-scrolling row of sections.
      await expect(page.locator('.topnav [aria-current="page"]')).toBeInViewport();
    });
  }
});
