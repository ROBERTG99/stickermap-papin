import { cloudflare } from "@cloudflare/vite-plugin";
import preact from "@preact/preset-vite";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

export default defineConfig({
  root: "src",
  publicDir: "public",
  build: { outDir: "../dist", emptyOutDir: true, sourcemap: true },
  plugins: [preact(), cloudflare({
      configPath: "../wrangler.jsonc",
      // Same local D1/R2 state as `wrangler d1/r2 --local` and scripts/migrate.ts (the Vite root is src/); e2e uses its own via MP_STATE_DIR
      persistState: { path: fileURLToPath(new URL(`./${process.env.MP_STATE_DIR ?? ".wrangler/state"}`, import.meta.url)) },
    })],
});
