import { test, expect } from "./fixtures/index.js";

test.describe("Security Monitor", () => {
  test("displays 4 security KPI cards", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(5, { status: "blocked", pii_detected: true, pii_types_found: '["EMAIL","PHONE"]' });
    await authenticatedPage.goto(`${adminServer.url}/admin/security`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("Blocked Requests")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("PII Detections")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Injection Attempts")).toBeVisible({ timeout: 10000 });
    await expect(authenticatedPage.getByText("Content Filter")).toBeVisible({ timeout: 10000 });
  });

  test("PII Detection by Type bar chart renders", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(3, { pii_detected: true, pii_types_found: '["EMAIL","PHONE","SSN"]' });
    await authenticatedPage.goto(`${adminServer.url}/admin/security`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("PII Detection by Type")).toBeVisible({ timeout: 10000 });
  });

  test("Injection Score Distribution histogram renders", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(5, { prompt_injection_score: 0.7 });
    await authenticatedPage.goto(`${adminServer.url}/admin/security`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("Injection Score Distribution")).toBeVisible({ timeout: 10000 });
  });

  test("Threat Feed table shows blocked entries", async ({ adminServer, authenticatedPage }) => {
    adminServer.seedAuditLogs(3, { status: "blocked" });
    await authenticatedPage.goto(`${adminServer.url}/admin/security`);
    await authenticatedPage.waitForLoadState("networkidle");
    await expect(authenticatedPage.getByText("Threat Feed")).toBeVisible({ timeout: 10000 });
  });
});
