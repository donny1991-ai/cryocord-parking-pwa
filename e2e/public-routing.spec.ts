import { expect, test } from "@playwright/test";

test.describe("public and protected routing", () => {
  test("redirects unauthenticated parking users to sign in", async ({ page }) => {
    await page.goto("/parking");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Parking sign in" })).toBeVisible();
    await expect(page.getByText("Use the 6-digit code sent to your staff email.")).toBeVisible();
  });

  test("renders the login form and enables OTP request only after email entry", async ({ page }) => {
    await page.goto("/login");

    const email = page.getByPlaceholder("name@cryocord.com.my");
    const sendCode = page.getByRole("button", { name: "Send code" });

    await expect(email).toBeVisible();
    await expect(sendCode).toBeDisabled();

    await email.fill("guard@example.com");
    await expect(sendCode).toBeEnabled();
  });

  test("shows an inactive public pass for an invalid token", async ({ page }) => {
    await page.goto("/pass/not-a-valid-token");

    await expect(page.getByText("Visitor Pass", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pass expired" })).toBeVisible();
    await expect(page.getByText("This visitor pass is expired or invalid.")).toBeVisible();
    await expect(page.getByText("QR code hidden after expiry or checkout.")).toBeVisible();
  });
});
