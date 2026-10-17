import { defineConfig } from "@playwright/test";

// The app and the API must already be running (CI starts them; locally see e2e/README.md).
export default defineConfig({
  testDir: "./e2e",
  // One worker: the specs share one database and one admin user.
  workers: 1,
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:8080",
    // Set E2E_CHANNEL=chrome to use an installed Chrome instead of downloading Chromium.
    channel: process.env.E2E_CHANNEL || undefined,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
