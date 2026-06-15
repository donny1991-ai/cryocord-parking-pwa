import "dotenv/config";
import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { SignJWT } from "jose";
import { Client } from "pg";
import { PASS_IMAGE_VERSION } from "../src/lib/pass-image-version";

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
    await email.pressSequentially("guard@cryocord.com.my", { delay: 5 });
    await expect(email).toHaveValue("guard@cryocord.com.my");
    await expect(sendCode).toBeEnabled({ timeout: 10000 });
  });

  test("shows an inactive public pass for an invalid token", async ({ page }) => {
    await page.goto("/pass/not-a-valid-token");

    await expect(page.getByText("Visitor Pass", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pass expired" })).toBeVisible();
    await expect(page.getByText("This visitor pass is expired or invalid.")).toBeVisible();
    await expect(page.getByText("QR code hidden after expiry or checkout.")).toBeVisible();
  });

  test("shows the active public pass with the visitor pass template", async ({ page }, testInfo) => {
    const seeded = await seedActivePublicPass(testInfo.project.name);

    await page.goto(`/pass/${encodeURIComponent(seeded.token)}`);

    await expect(page.getByTestId("public-pass-template")).toBeVisible();
    await expect(page.getByText(`Vehicle: ${seeded.plate}`)).toBeVisible();
    await expect(page.getByText(`Visitor: ${seeded.visitorName}`)).toBeVisible();
    await expect(page.getByRole("link", { name: "Save pass image" })).toHaveAttribute(
      "href",
      `/api/public/pass-image?token=${encodeURIComponent(seeded.token)}&v=${PASS_IMAGE_VERSION}`,
    );

    const imageResponse = await page.request.get(`/api/public/pass-image?token=${encodeURIComponent(seeded.token)}&v=${PASS_IMAGE_VERSION}`);
    expect(imageResponse.ok()).toBe(true);
    expect(imageResponse.headers()["content-type"]).toContain("image/png");
  });

  test("renders public wall QR registration without staff sign-in", async ({ page }) => {
    await page.goto("/register");

    await expect(page.getByRole("heading", { name: "Entry request" })).toBeVisible();
    await expect(page.getByLabel("Person or department to visit")).toBeVisible();
    await expect(page.getByLabel("Vehicle plate")).toBeVisible();
    await expect(page.getByRole("button", { name: "Submit registration" })).toBeDisabled();
  });
});

async function seedActivePublicPass(projectName: string) {
  const suffix = projectName.includes("mobile") ? "MOB" : "DSK";
  const visitorId = randomUUID();
  const tokenId = randomUUID();
  const visitorName = `E2E Public ${suffix}`;
  const plate = `PASS ${suffix}`;
  const visitDate = futureVisitDate();
  const token = await signVisitToken(visitorId, tokenId, getPreRegistrationTokenExpiresAt(visitDate));
  const client = new Client(databaseConfig());

  await client.connect();
  try {
    const type = await client.query<{ id: number }>(
      `SELECT "id" FROM "parking"."visitor_types" WHERE "code" = 'visitor' LIMIT 1`,
    );
    const typeId = type.rows[0]?.id;
    if (!typeId) throw new Error("Parking visitor type seed is missing.");

    await client.query(
      `
        INSERT INTO "parking"."visitors" (
          "id",
          "name",
          "phone_number",
          "organisation",
          "vehicle_number",
          "vehicle_number_normalised",
          "additional_vehicle_numbers",
          "type_id",
          "purpose",
          "visit_date",
          "qr_token_jti",
          "status",
          "created_at",
          "updated_at"
        )
        VALUES ($1, $2, '+60000000000', 'CryoCord', $3, $4, ARRAY[]::text[], $5, 'meeting', $6, $7, 'pending', now(), now())
      `,
      [visitorId, visitorName, plate, plate.replace(/[\s-]/g, ""), typeId, visitDate, tokenId],
    );
  } finally {
    await client.end();
  }

  return { token, visitorName, plate };
}

function futureVisitDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function getPreRegistrationTokenExpiresAt(visitDate: string) {
  const [year, month, day] = visitDate.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 0, 0, 0, 0) - 8 * 60 * 60 * 1000 - 1000);
}

async function signVisitToken(visitId: string, tokenId: string, expiresAt: Date) {
  const secret = process.env.PARKING_QR_SIGNING_KEY ?? "dev-only-insecure-key-rotate-in-prod";
  return new SignJWT({ visitId })
    .setProtectedHeader({ alg: "HS256", kid: process.env.PARKING_QR_KEY_ID ?? "dev" })
    .setIssuedAt()
    .setIssuer("cryocord-parking")
    .setJti(tokenId)
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(new TextEncoder().encode(secret));
}

function databaseConfig() {
  const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or SUPABASE_DB_URL is required for public pass e2e setup.");
  }

  const sslEnabled = (process.env.DATABASE_SSL ?? process.env.SUPABASE_DB_SSL) === "true";
  return {
    connectionString,
    ssl: sslEnabled
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined,
  };
}
