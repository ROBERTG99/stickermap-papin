import { defineConfig, devices } from "@playwright/test";

/** E2E runs against its own local D1/R2 state (`.wrangler/e2e-state`, seeded by tests/e2e/global-setup.ts), never the dev data. */
export default defineConfig({
  testDir: "tests/e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: "http://localhost:5174", trace: "retain-on-failure", locale: "es-UY", timezoneId: "America/Montevideo" },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 } }, testIgnore: /.*\.desktop\.spec\.ts/ },
    { name: "desktop", use: { viewport: { width: 1440, height: 900 } }, testMatch: /.*\.desktop\.spec\.ts/ },
  ],
  webServer: {
    command: "npx tsx tests/e2e/global-setup.ts && npm run dev -- --port 5174 --strictPort",
    url: "http://localhost:5174/api/health",
    reuseExistingServer: false, // the command rebuilds the e2e state: a server left over from an earlier run would hold stale files
    timeout: 120_000,
    env: { MP_STATE_DIR: ".wrangler/e2e-state" },
  },
});
