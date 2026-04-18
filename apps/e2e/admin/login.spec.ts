import { test, expect, ADMIN_TOKEN } from "./fixtures/index.js";

test.describe("Login Page", () => {
  test("renders login form with title and token input", async ({ adminServer, page }) => {
    await page.goto(`${adminServer.url}/admin/login`);
    await page.waitForLoadState("networkidle");
    await expect(page.locator("h1")).toContainText("LLM Gateway Admin");
    await expect(page.locator('input[type="password"]')).toBeVisible();
    await expect(page.getByText("Sign In")).toBeVisible();
  });

  test("show/hide password toggle works", async ({ adminServer, page }) => {
    await page.goto(`${adminServer.url}/admin/login`);
    await page.waitForLoadState("networkidle");
    const input = page.locator('input[type="password"]');
    await expect(input).toHaveAttribute("type", "password");
    await page.locator('button[type="button"]').click();
    await expect(page.locator('input[type="text"]')).toBeVisible();
    await page.locator('button[type="button"]').click();
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("login with valid token redirects to overview", async ({ adminServer, page }) => {
    await page.goto(`${adminServer.url}/admin/login`);
    await page.waitForLoadState("networkidle");
    await page.locator('input[type="password"]').fill(ADMIN_TOKEN);
    await page.getByText("Sign In").click();
    await page.waitForURL(/\/admin\/?$/, { timeout: 10000 });
    expect(page.url()).toContain("/admin");
  });

  test("login with invalid token shows error or redirects to login", async ({ adminServer, page }) => {
    await page.goto(`${adminServer.url}/admin/login`);
    await page.waitForLoadState("networkidle");
    await page.locator('input[type="password"]').fill("wrong-token");
    await page.getByText("Sign In").click();
    await page.waitForTimeout(3000);
    const bodyText = await page.locator("body").textContent();
    const hasError = /invalid|error|failed|unauthorized/i.test(bodyText ?? "");
    const stillOnLogin = page.url().includes("/login");
    expect(hasError || stillOnLogin).toBeTruthy();
  });

  test("submit button is disabled when token is empty", async ({ adminServer, page }) => {
    await page.goto(`${adminServer.url}/admin/login`);
    await page.waitForLoadState("networkidle");
    const btn = page.getByText("Sign In");
    await expect(btn).toBeDisabled();
  });

  test("already authenticated user visiting /login gets redirected", async ({ authenticatedPage, adminServer }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/login`);
    await authenticatedPage.waitForLoadState("networkidle");
    await authenticatedPage.waitForURL(/\/admin\/?$/, { timeout: 10000 });
    expect(authenticatedPage.url()).not.toContain("/login");
  });

  test("auth guard redirects unauthenticated users to /login", async ({ adminServer, page }) => {
    await page.goto(`${adminServer.url}/admin/keys`);
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);
    expect(page.url()).toContain("/login");
  });

  test("logout clears token and redirects to login", async ({ authenticatedPage, adminServer }) => {
    await expect(authenticatedPage.getByText("LLM Gateway")).toBeVisible();
    await authenticatedPage.getByText("Logout").click();
    await authenticatedPage.waitForURL(/\/admin\/login/, { timeout: 10000 });
    expect(authenticatedPage.url()).toContain("/login");
    const token = await authenticatedPage.evaluate(() => localStorage.getItem("llm-gw-admin-token"));
    expect(token).toBeNull();
  });
});
