import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

/** Worker integration tests: the real Worker, D1 (migrations applied) and R2 inside the Workers runtime. */
export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: "./wrangler.jsonc" },
        miniflare: {
          // a stand-in for the built SPA so /s/:id can inject Open Graph tags into index.html
          assets: { directory: "./tests/worker/fixtures/assets", binding: "ASSETS", assetConfig: { not_found_behavior: "single-page-application" } },
          bindings: {
            TEST_MIGRATIONS: migrations,
            TURNSTILE_SECRET: "test-turnstile-secret",
            IP_HASH_SECRET: "test-ip-secret",
            ACCESS_TEAM_DOMAIN: "",
            ACCESS_AUD: "",
            ADMIN_ORIGIN: "https://admin.example.test",
            CONTACT_EMAIL: "test@example.com",
          },
        },
      }),
    ],
    test: { include: ["tests/worker/**/*.test.ts"], setupFiles: ["./tests/worker/setup.ts"] },
  };
});
