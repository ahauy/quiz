import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["verification/*.exam-db.spec.ts", "verification/*.perf.spec.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
