import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 8080,
  },
  preview: {
    host: "127.0.0.1",
    port: 8080,
  },
  build: {
    // Source maps for Sentry stack traces; "hidden" keeps them out of the served bundles.
    sourcemap: "hidden",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.ts",
    // Playwright specs (run by `npx playwright test`) must not be picked up by vitest.
    exclude: ["**/node_modules/**", "e2e/**"],
  },
});
