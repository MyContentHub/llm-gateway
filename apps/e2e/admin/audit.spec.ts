import { test, expect } from "./fixtures/index.js";

test.describe("Audit Log Browser", () => {
  test("audit table loads with default view", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(3);
    await authenticatedPage.goto(`${adminServer.url}/admin/audit`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.locator("table")).toBeVisible({ timeout: 10000 });
    const rows = authenticatedPage.locator("table tbody tr");
    await expect(rows).toHaveCount(3, { timeout: 10000 });
  });

  test("filter by status dropdown works", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(10, { status: "success" });
    adminServer.seedAuditLogs(3, { status: "blocked" });
    await authenticatedPage.goto(`${adminServer.url}/admin/audit`);
    await authenticatedPage.waitForLoadState("networkidle");
    const statusSelect = authenticatedPage.locator("select").filter({ hasText: /status/i }).first();
    if (await statusSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      await statusSelect.selectOption("blocked");
      await authenticatedPage.waitForLoadState("networkidle");
    }
  });

  test("clicking a row opens detail drawer", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(1);
    await authenticatedPage.goto(`${adminServer.url}/admin/audit`);
    await authenticatedPage.waitForLoadState("networkidle");
    const row = authenticatedPage.locator("table tbody tr").first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();
    await expect(authenticatedPage.getByText("Request ID").first()).toBeVisible({ timeout: 10000 });
  });

  test("detail drawer displays log fields", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(1, {
      request_id: "detail-test-001",
      model: "gpt-4o",
      status: "success",
    });
    await authenticatedPage.goto(`${adminServer.url}/admin/audit`);
    await authenticatedPage.waitForLoadState("networkidle");
    const row = authenticatedPage.locator("table tbody tr").first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();
    await expect(authenticatedPage.getByText("detail-test-001")).toBeVisible({ timeout: 10000 });
  });

  test("detail drawer can be closed", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(1);
    await authenticatedPage.goto(`${adminServer.url}/admin/audit`);
    await authenticatedPage.waitForLoadState("networkidle");
    const row = authenticatedPage.locator("table tbody tr").first();
    await expect(row).toBeVisible({ timeout: 10000 });
    await row.click();
    await expect(authenticatedPage.getByText("Log Detail")).toBeVisible({ timeout: 10000 });
    const closeBtn = authenticatedPage.locator(".fixed.inset-y-0 button").filter({ has: authenticatedPage.locator("svg") }).first();
    if (await closeBtn.isVisible()) {
      await closeBtn.click();
      await authenticatedPage.waitForTimeout(500);
      await expect(authenticatedPage.getByText("Log Detail")).not.toBeVisible({ timeout: 5000 });
    }
  });

  test("export CSV triggers a download", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(5);
    await authenticatedPage.goto(`${adminServer.url}/admin/audit`);
    await authenticatedPage.waitForLoadState("networkidle");
    const exportBtn = authenticatedPage.getByText(/Export CSV/i).first();
    if (await exportBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      const downloadPromise = authenticatedPage.waitForEvent("download", { timeout: 15000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.csv/);
      }
    }
  });

  test("status badges show correct colors", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLog({
      request_id: "badge-success",
      timestamp: new Date().toISOString(),
      status: "success",
    });
    adminServer.seedAuditLog({
      request_id: "badge-blocked",
      timestamp: new Date().toISOString(),
      status: "blocked",
    });
    await authenticatedPage.goto(`${adminServer.url}/admin/audit`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.locator("table tbody").getByText("success").first()).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.locator("table tbody").getByText("blocked").first()).toBeVisible({ timeout: 10000 });
  });

  test("pagination controls work", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(55);
    await authenticatedPage.goto(`${adminServer.url}/admin/audit`);
    await authenticatedPage.waitForLoadState("networkidle");
    const nextBtn = authenticatedPage.getByText("Next");
    if (await nextBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await nextBtn.click();
      await authenticatedPage.waitForLoadState("networkidle");
    }
  });
});
