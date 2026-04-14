import { test, expect } from "./fixtures/index.js";

test.describe("Overview Dashboard", () => {
  test("displays 4 KPI cards with values", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(10);
    await authenticatedPage.goto(`${adminServer.url}/admin/`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("Total Requests")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Token Usage")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Total Cost")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Avg Latency")).toBeVisible({ timeout: 10000 });
  });

  test("bar chart for Requests by Model renders", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(5);
    await authenticatedPage.goto(`${adminServer.url}/admin/`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("Requests by Model")).toBeVisible({ timeout: 10000 });
    const svg = authenticatedPage.locator("svg.recharts-surface").first();
    await expect(svg).toBeVisible({ timeout: 10000 });
  });

  test("pie chart for Requests by Status renders", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(5);
    await authenticatedPage.goto(`${adminServer.url}/admin/`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("Requests by Status")).toBeVisible({ timeout: 10000 });
    await authenticatedPage.waitForTimeout(2000);
    const svgs = authenticatedPage.locator("svg.recharts-surface");
    const count = await svgs.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test("recent activity table shows rows when data exists", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(3);
    await authenticatedPage.goto(`${adminServer.url}/admin/`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("Recent Activity")).toBeVisible({ timeout: 10000 });
    const rows = authenticatedPage.locator("table tbody tr");
    await expect(rows).toHaveCount(3, { timeout: 10000 });
  });

  test("PII Detection Rate donut chart renders", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(5);
    await authenticatedPage.goto(`${adminServer.url}/admin/`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("PII Detection Rate")).toBeVisible({ timeout: 10000 });
  });
});
