import { expect, test } from "@playwright/test";

// TC-002 (D-AUTH-03): real Google authorization-code consent flow, opt-in only.
// Interactive Google consent cannot run headless/unattended, so this spec is skipped
// by default. Run it locally with: E2E_GOOGLE_REAL=1 pnpm --filter web test:e2e:google
// and real credentials (E2E_GOOGLE_EMAIL / E2E_GOOGLE_PASSWORD). Do NOT fake Google.
const REAL = process.env.E2E_GOOGLE_REAL === "1";

test("TC-002 real Google OAuth authorization-code flow", async ({ page }) => {
  test.skip(
    !REAL,
    "Real Google consent is opt-in: set E2E_GOOGLE_REAL=1 and use the dedicated headed script.",
  );
  const email = process.env.E2E_GOOGLE_EMAIL;
  const password = process.env.E2E_GOOGLE_PASSWORD;
  test.skip(
    !email || !password,
    "E2E_GOOGLE_EMAIL and E2E_GOOGLE_PASSWORD are required for the real consent flow.",
  );

  await page.goto("/login");
  await page.getByRole("button", { name: "Đăng nhập với Google" }).click();
  // GET /auth/oauth/google/url returns a real accounts.google.com URL; the app navigates there.
  await expect(page).toHaveURL(/accounts\.google\.com/, { timeout: 30_000 });

  // Best-effort selectors against the real Google consent screen (may need 2FA/manual steps).
  await page.locator('input[type="email"]').fill(email!);
  await page.getByRole("button", { name: "Next" }).click();
  await page.locator('input[type="password"]').fill(password!);
  await page.getByRole("button", { name: "Next" }).click();

  // Google redirects to /oauth/callback, which exchanges code+state and lands on a role home.
  await expect(page).toHaveURL(/\/(teacher|student)$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: /Khu vực/ })).toBeVisible();
});
