import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";

// Migrations (schema + seed types) run once per test file; storage is isolated per test by the plugin.
await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
