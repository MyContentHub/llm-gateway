import { test, expect } from "./fixtures/index.js";

test.describe("Settings Page", () => {
  test("displays config sections", async ({ adminServer, authenticatedPage }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/settings`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByRole("heading", { name: "General" })).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByRole("heading", { name: "Security Rules" })).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByRole("heading", { name: "Retry Policy" })).toBeVisible({ timeout: 10000 });
  });

  test("provider configuration section shows details", async ({ adminServer, authenticatedPage }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/settings`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("test-provider", { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test("TOML preview code block renders", async ({ adminServer, authenticatedPage }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/settings`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("TOML Preview")).toBeVisible({ timeout: 10000 });
    const codeBlock = authenticatedPage.locator("pre").first();
    await expect(codeBlock).toBeVisible({ timeout: 10000 });
    const text = await codeBlock.textContent();
    expect(text).toBeTruthy();
    expect(text).toContain("[general]");
    expect(text).toContain("[security]");
  });
});
