import { execFileSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import { seed } from "./seed";

/**
 * Fresh local state for every e2e run: schema + seed types, the 5 icons and a small synthetic world of spots.
 * It runs as the first half of the web server command (`tsx tests/e2e/global-setup.ts && npm run dev ...`): Playwright
 * starts the web server before any globalSetup hook, and the server must not hold the state files while they are rebuilt.
 */
const STATE = ".wrangler/e2e-state";
// the photo fixtures are generated (git-ignored) and cheap: build them when missing
if (!existsSync("tests/e2e/fixtures/generated/bulk-50/broken.jpg") || !existsSync("tests/e2e/fixtures/generated/extra/extra-20.jpg")) {
  execFileSync("node_modules/.bin/tsx", ["tests/e2e/fixtures/make-fixtures.ts"], { stdio: "pipe" });
}
rmSync(STATE, { recursive: true, force: true });
execFileSync("node_modules/.bin/wrangler", ["d1", "migrations", "apply", "stickermap", "--local", "--persist-to", STATE], { stdio: "pipe" });
const spots = await seed(STATE);
console.log(`e2e state ready: ${spots.length} seeded spots`);
