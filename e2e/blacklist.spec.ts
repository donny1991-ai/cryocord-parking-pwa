import "dotenv/config";
import { expect, test, type TestInfo } from "@playwright/test";
import { SignJWT } from "jose";
import { Client } from "pg";

const PARKING_SESSION_COOKIE = "parking_session";
const AUTHENTICATED_AUDIENCE = "authenticated";
const LOCAL_SUPABASE_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

test.describe("vehicle blacklist", () => {
  test("blocks new entry registration for a blacklisted plate", async ({ context, page }, testInfo) => {
    const seed = await seedBlacklistedVehicle(testInfo);
    const token = await signParkingAccessToken(seed.guardId);

    await context.addCookies([
      {
        name: PARKING_SESSION_COOKIE,
        value: token,
        domain: "127.0.0.1",
        path: "/",
        httpOnly: true,
        sameSite: "Lax",
      },
    ]);

    await page.goto("/parking/entry");
    await expect(page.getByRole("heading", { name: "New Entry" })).toBeVisible();

    const plateInput = page.getByPlaceholder("e.g. WA 18 K");
    await plateInput.pressSequentially(seed.plate);
    await expect(plateInput).toHaveValue(seed.plate);
    await expect(page.getByRole("button", { name: "Use" })).toBeEnabled();
    await page.getByRole("button", { name: "Use" }).click();

    await expect(page.getByText("Vehicle is blacklisted. Registration is blocked.")).toBeVisible();
    await expect(page.getByText(`Do not issue a visitor pass for ${seed.plate}.`)).toBeVisible();
    await expect(page.getByText(`Reason: ${seed.reason}`)).toBeVisible();
    await expect(page.getByText("Entry logging is disabled because this plate is blacklisted.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Log Entry & Issue Pass/ })).toBeDisabled();
  });
});

async function seedBlacklistedVehicle(testInfo: TestInfo) {
  const suffix = testInfo.project.name.includes("mobile") ? "MOB" : "DSK";
  const guardId = testInfo.project.name.includes("mobile")
    ? "00000000-0000-4000-8000-00000000e2e2"
    : "00000000-0000-4000-8000-00000000e2e1";
  const email = `e2e-${suffix.toLowerCase()}@parking.test`;
  const plate = `E2E ${suffix}`;
  const plateNormalised = plate.replace(/[\s-]/g, "");
  const reason = `E2E blacklist ${suffix}`;
  const client = new Client(databaseConfig());

  await client.connect();
  try {
    await client.query(
      `
        INSERT INTO "auth"."users" (
          "id",
          "aud",
          "role",
          "email",
          "email_confirmed_at",
          "raw_app_meta_data",
          "raw_user_meta_data",
          "is_super_admin",
          "is_sso_user",
          "is_anonymous",
          "created_at",
          "updated_at"
        )
        VALUES (
          $1,
          'authenticated',
          'authenticated',
          $2,
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{}'::jsonb,
          false,
          false,
          false,
          now(),
          now()
        )
        ON CONFLICT ("id") DO UPDATE SET
          "aud" = EXCLUDED."aud",
          "role" = EXCLUDED."role",
          "email" = EXCLUDED."email",
          "updated_at" = now()
      `,
      [guardId, email],
    );

    await client.query(
      `
        INSERT INTO "parking"."users" ("id", "name", "phone", "role", "active")
        VALUES ($1, $2, '+60000000000', 'guard', true)
        ON CONFLICT ("id") DO UPDATE SET
          "name" = EXCLUDED."name",
          "phone" = EXCLUDED."phone",
          "role" = EXCLUDED."role",
          "active" = EXCLUDED."active",
          "updated_at" = now()
      `,
      [guardId, `E2E ${suffix} Guard`],
    );

    await client.query(
      `
        INSERT INTO "parking"."vehicles" (
          "plate",
          "plate_normalised",
          "owner_name",
          "owner_contact",
          "owner_type",
          "notes",
          "blacklisted"
        )
        VALUES ($1, $2, 'E2E Blocked Driver', '+60000000001', 'visitor', $3, true)
        ON CONFLICT ("plate_normalised") DO UPDATE SET
          "plate" = EXCLUDED."plate",
          "owner_name" = EXCLUDED."owner_name",
          "owner_contact" = EXCLUDED."owner_contact",
          "owner_type" = EXCLUDED."owner_type",
          "notes" = EXCLUDED."notes",
          "blacklisted" = true,
          "updated_at" = now()
      `,
      [plate, plateNormalised, reason],
    );
  } finally {
    await client.end();
  }

  return { guardId, plate, reason };
}

function databaseConfig() {
  const connectionString = process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL or SUPABASE_DB_URL is required for blacklist e2e setup.");
  }

  const sslEnabled = (process.env.DATABASE_SSL ?? process.env.SUPABASE_DB_SSL) === "true";
  return {
    connectionString,
    ssl: sslEnabled
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : undefined,
  };
}

async function signParkingAccessToken(userId: string) {
  const secret = process.env.SUPABASE_JWT_SECRET ?? process.env.SUPABASE_AUTH_JWT_SECRET ?? LOCAL_SUPABASE_JWT_SECRET;
  return new SignJWT({ role: AUTHENTICATED_AUDIENCE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(AUTHENTICATED_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(secret));
}
