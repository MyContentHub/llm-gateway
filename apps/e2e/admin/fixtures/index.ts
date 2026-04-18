import { test as base, expect } from "@playwright/test";
import { startE2EServer, ADMIN_TOKEN, type E2EServerResult } from "./admin-server.js";

export { ADMIN_TOKEN };

type E2EFixtures = {
  adminServer: E2EServerResult;
  adminUrl: string;
  authenticatedPage: import("@playwright/test").Page;
};

export const test = base.extend<E2EFixtures>({
  adminServer: async ({}, use) => {
    const server = await startE2EServer();
    await use(server);
    await server.cleanup();
  },

  adminUrl: async ({ adminServer }, use) => {
    await use(adminServer.url);
  },

  authenticatedPage: async ({ page, adminServer }, use) => {
    await page.goto(`${adminServer.url}/admin/login`);
    await page.evaluate((token) => {
      localStorage.setItem("llm-gw-admin-token", token);
    }, ADMIN_TOKEN);
    await page.goto(`${adminServer.url}/admin/`);
    await page.waitForURL("**/admin/");
    await use(page);
  },
});

export { expect };
