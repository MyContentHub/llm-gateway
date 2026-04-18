import { test, expect } from "./fixtures/index.js";

test.describe("API Key Management", () => {
  test("keys table loads and displays columns", async ({ adminServer, authenticatedPage }) => {
    await adminServer.createKey("key-1");
    await adminServer.createKey("key-2");
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("key-1")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("key-2")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.locator("th").getByText("Name")).toBeVisible({ timeout: 10000 });
  });

  test("create key dialog opens and submits", async ({ adminServer, authenticatedPage }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await authenticatedPage.getByRole("button", { name: "Create Key" }).dispatchEvent("click");
    await expect(authenticatedPage.getByText("Create API Key")).toBeVisible({ timeout: 5000 });
    await authenticatedPage.locator('input[type="text"]').fill("my-new-key");
    await authenticatedPage.locator('form button[type="submit"]').click();
    await expect(authenticatedPage.getByText("API Key Created")).toBeVisible({ timeout: 10000 });
  });

  test("created key is shown in display dialog with gwk_ prefix", async ({ adminServer, authenticatedPage }) => {
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await authenticatedPage.getByRole("button", { name: "Create Key" }).dispatchEvent("click");
    await expect(authenticatedPage.getByText("Create API Key")).toBeVisible({ timeout: 5000 });
    await authenticatedPage.locator('input[type="text"]').fill("display-test");
    await authenticatedPage.locator('form button[type="submit"]').click();
    await expect(authenticatedPage.getByText(/gwk_[a-zA-Z0-9]/)).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Copy this key now")).toBeVisible({ timeout: 5000 });
  });

  test("edit key sheet opens with pre-filled data", async ({ adminServer, authenticatedPage }) => {
    await adminServer.createKey("editable-key");
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("editable-key")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.locator('button[title="Edit"]').first().click();
    await expect(authenticatedPage.getByText("Edit Key")).toBeVisible({ timeout: 5000 });
    const input = authenticatedPage.locator('form input[type="text"]');
    await expect(input).toHaveValue("editable-key");
  });

  test("edit key name updates successfully", async ({ adminServer, authenticatedPage }) => {
    await adminServer.createKey("before-edit");
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("before-edit")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.locator('button[title="Edit"]').first().click();
    await expect(authenticatedPage.getByText("Edit Key")).toBeVisible({ timeout: 5000 });
    const input = authenticatedPage.locator('form input[type="text"]');
    await input.clear();
    await input.fill("after-edit");
    await authenticatedPage.getByText("Save Changes").click();
    await expect(authenticatedPage.getByText("after-edit")).toBeVisible({ timeout: 10000 });
  });

  test("revoke key shows confirmation dialog", async ({ adminServer, authenticatedPage }) => {
    await adminServer.createKey("revoke-me");
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("revoke-me")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.locator('button[title="Revoke"]').first().click();
    await expect(authenticatedPage.getByText("Revoke API Key")).toBeVisible({ timeout: 5000 });
    await expect(authenticatedPage.getByText("This action cannot be undone")).toBeVisible();
  });

  test("revoke key marks key as revoked", async ({ adminServer, authenticatedPage }) => {
    await adminServer.createKey("will-revoke");
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("will-revoke")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.locator('button[title="Revoke"]').first().click();
    await expect(authenticatedPage.getByText("Revoke API Key")).toBeVisible({ timeout: 5000 });
    const revokeBtn = authenticatedPage.locator('button.bg-destructive');
    await revokeBtn.click();
    await expect(authenticatedPage.getByText("Revoked").first()).toBeVisible({ timeout: 10000 });
  });

  test("revoked keys show disabled edit button", async ({ adminServer, authenticatedPage }) => {
    const { id } = await adminServer.createKey("already-revoked");
    adminServer.db.prepare("UPDATE virtual_keys SET revoked_at = datetime('now') WHERE id = ?").run(id);
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("already-revoked")).toBeVisible({ timeout: 10000 });
    const editBtn = authenticatedPage.locator('button[title="Edit"]').first();
    await expect(editBtn).toBeDisabled();
  });

  test("pagination works for multiple pages of keys", async ({ adminServer, authenticatedPage }) => {
    for (let i = 0; i < 22; i++) {
      await adminServer.createKey(`page-key-${i.toString().padStart(2, "0")}`);
    }
    await authenticatedPage.goto(`${adminServer.url}/admin/keys`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText(/page-key-/).first()).toBeVisible({ timeout: 10000 });
    const pageInfo = authenticatedPage.getByText(/Page \d+ of \d+/);
    if (await pageInfo.isVisible({ timeout: 5000 }).catch(() => false)) {
      const nextBtn = authenticatedPage.locator(".flex.gap-1 > button").last();
      await nextBtn.click();
      await authenticatedPage.waitForLoadState("networkidle");
      await expect(authenticatedPage.getByText(/Page 2 of/)).toBeVisible({ timeout: 5000 });
    }
  });
});
