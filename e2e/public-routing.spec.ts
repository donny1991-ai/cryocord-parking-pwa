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
    await expect(email).toBeEditable();
    await expect(sendCode).toBeDisabled();

    await email.click();
    await email.pressSequentially("guard@cryocord.com.my");
    await expect(email).toHaveValue("guard@cryocord.com.my");
    if (await sendCode.isDisabled()) {
      await email.clear();
      await email.pressSequentially("guard@cryocord.com.my");
      await expect(email).toHaveValue("guard@cryocord.com.my");
    }
    await expect(sendCode).toBeEnabled({ timeout: 10000 });
  });

  test("shows an inactive public pass for an invalid token", async ({ page }) => {
    await page.goto("/pass/not-a-valid-token");

    await expect(page.getByText("Visitor Pass", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pass expired" })).toBeVisible();
    await expect(page.getByText("This visitor pass is expired or invalid.")).toBeVisible();
    await expect(page.getByText("QR code hidden after expiry or checkout.")).toBeVisible();
  });

  test("renders public wall QR registration without staff sign-in", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "Entry request" })).toBeVisible();
    await expect(page.getByLabel("Person or department to visit")).toBeVisible();
    await expect(page.getByLabel("Vehicle plate")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit registration" })).toBeDisabled();
  });
});
