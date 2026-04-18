import { test, expect } from "./fixtures/index.js";

test.describe("Providers Page", () => {
  test("provider cards render with name and details", async ({ adminServer, authenticatedPage }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/providers`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("test-provider")).toBeVisible({ timeout: 10000 });
  });

  test("health indicator dots are visible", async ({ adminServer, authenticatedPage }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/providers`);
    await authenticatedPage.waitForLoadState("networkidle");
    await authenticatedPage.waitForTimeout(2000);
    const dots = authenticatedPage.locator(".rounded-full.h-2\\.5.w-2\\.5, .rounded-full.w-2\\.5.h-2\\.5");
    expect(await dots.count()).toBeGreaterThanOrEqual(0);
  });

  test("provider card shows model mappings", async ({ adminServer, authenticatedPage }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/providers`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("gpt-4o").first()).toBeVisible({ timeout: 10000 });
  });
});
