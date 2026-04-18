import { test, expect } from "./fixtures/index.js";

test.describe("Navigation and Layout", () => {
  test("sidebar navigation links work", async ({ authenticatedPage }) => {
    const links = [
      { label: "Keys", path: "/admin/keys" },
      { label: "Audit", path: "/admin/audit" },
      { label: "Security", path: "/admin/security" },
      { label: "Providers", path: "/admin/providers" },
      { label: "Settings", path: "/admin/settings" },
    ];
    for (const link of links) {
      await authenticatedPage.getByText(link.label, { exact: true }).click();
      await authenticatedPage.waitForLoadState("networkidle");
      await authenticatedPage.waitForURL(`**${link.path}**`, { timeout: 10000 });
      expect(authenticatedPage.url()).toContain(link.path);
    }
  });

  test("sidebar collapse/expand toggle on desktop", async ({ authenticatedPage }) => {
    const sidebar = authenticatedPage.locator("aside").first();
    const initialWidth = await sidebar.boundingBox();
    const toggleBtn = authenticatedPage.locator("aside button").first();
    await toggleBtn.click();
    await authenticatedPage.waitForTimeout(400);
    const collapsedBox = await sidebar.boundingBox();
    expect(collapsedBox!.width).toBeLessThan(initialWidth!.width);
    await toggleBtn.click();
    await authenticatedPage.waitForTimeout(400);
    const expandedBox = await sidebar.boundingBox();
    expect(expandedBox!.width).toBeGreaterThan(collapsedBox!.width);
  });

  test("mobile hamburger menu opens sidebar overlay", async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize({ width: 375, height: 667 });
    await authenticatedPage.waitForTimeout(500);
    const menuBtn = authenticatedPage.locator("header button").first();
    await menuBtn.click();
    await authenticatedPage.waitForTimeout(500);
    const aside = authenticatedPage.locator("aside").last();
    await expect(aside).toBeVisible();
  });

  test("Home link navigates to overview", async ({ authenticatedPage }) => {
    await authenticatedPage.getByText("Home", { exact: true }).click();
    await authenticatedPage.waitForTimeout(500);
    expect(authenticatedPage.url()).toMatch(/\/admin\/?$/);
  });

  test("active nav item is highlighted for current route", async ({ authenticatedPage }) => {
    await authenticatedPage.getByText("Keys", { exact: true }).click();
    await authenticatedPage.waitForLoadState("networkidle");
    await authenticatedPage.waitForURL("**/admin/keys**", { timeout: 10000 });
    const activeLink = authenticatedPage.locator("a").filter({ hasText: "Keys" }).first();
    const classes = await activeLink.getAttribute("class");
    expect(classes).toContain("bg-accent");
  });
});
