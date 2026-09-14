import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "tests/industrial",
  testMatch: "*.spec.ts",
  timeout: 90000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: "docs/industrial/evidence/interface-tests.json" }]],
  use: {
    baseURL: process.env["MAP_URL"] ?? "http://127.0.0.1:5173",
    channel: "chrome",
    headless: true,
    viewport: { width: 1448, height: 1000 },
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  outputDir: "test-results/industrial",
});
