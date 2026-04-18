import { defineConfig } from "@playwright/test";

export default defineConfig({
      testDir: "./admin",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: [["html", { open: "never" }], ["list"]],
  timeout: 30000,
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "admin-e2e",
      use: {
        channel: "chrome",
        viewport: { width: 1280, height: 720 },
      },
  testDir: "./admin",
      testMatch: "*.spec.ts",
    },
  ],
  outputDir: "./admin/results",
});
