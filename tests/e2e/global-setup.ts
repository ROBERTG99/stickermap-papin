import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import { seed } from "./seed";

/** Fresh local state for every e2e run: schema + seed types, the 5 icons and a small synthetic world of spots. */
export default async function globalSetup(): Promise<void> {
  rmSync(".wrangler/e2e-state", { recursive: true, force: true });
  execFileSync("node_modules/.bin/wrangler", ["d1", "migrations", "apply", "stickermap", "--local", "--persist-to", ".wrangler/e2e-state"], { stdio: "pipe" });
  await seed(".wrangler/e2e-state");
}
