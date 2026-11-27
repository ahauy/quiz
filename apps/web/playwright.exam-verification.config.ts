import { defineConfig, devices } from "@playwright/test";

const artifactDirectory = process.env.EXAM_VERIFY_ARTIFACT_DIR;
if (!process.env.EXAM_VERIFY_SETUP_FILE || !artifactDirectory ||
    process.env.DATABASE_URL !== process.env.EXAM_VERIFY_DATABASE_URL) {
  throw new Error("Use run-exam-verification.mjs with an explicit disposable target");
}

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  workers: 2,
  reporter: [["list"], ["json", { outputFile: `${artifactDirectory}/results.json` }]],
  outputDir: artifactDirectory,
  globalSetup: "./e2e/exam-verification.global-setup.ts",
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: "corepack pnpm --filter @quiz/api start",
      cwd: "../..",
      url: "http://localhost:3000/health",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "corepack pnpm exec vite --host 127.0.0.1 --port 5173 --strictPort",
      url: "http://localhost:5173",
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
