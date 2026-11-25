import { expect, test } from "@playwright/test";

test("app shell renders and health endpoint responds", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Web thi trắc nghiệm" })).toBeVisible();

  const response = await request.get("http://localhost:3000/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.database).toBe("connected");
});
