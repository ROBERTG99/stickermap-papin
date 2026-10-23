import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Worker integration tests (workers pool) are added in tests/worker with their own config in Phase 8.
    include: ["tests/unit/**/*.test.ts"],
    environment: "node",
  },
});
