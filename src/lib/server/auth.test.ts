// @vitest-environment node

import { SignJWT } from "jose";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { signTestSupabaseAccessToken } from "@/test/auth-token";
import { verifySupabaseAccessToken } from "./auth";

const TEST_USER_ID = "00000000-0000-4000-8000-000000000001";
const TEST_SECRET = "unit-test-supabase-jwt-secret-with-32-plus-chars";

describe("Supabase access token verification", () => {
  beforeEach(() => {
    vi.stubEnv("TEST_SUPABASE_JWT_SECRET", TEST_SECRET);
  });

  it("accepts authenticated Supabase access tokens", async () => {
    const token = await signTestSupabaseAccessToken(TEST_USER_ID);

    await expect(verifySupabaseAccessToken(token)).resolves.toBe(TEST_USER_ID);
  });

  it("rejects anon-role tokens for protected parking endpoints", async () => {
    const token = await new SignJWT({ role: "anon" })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(TEST_USER_ID)
      .setAudience("anon")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(TEST_SECRET));

    await expect(verifySupabaseAccessToken(token)).rejects.toMatchObject({
      status: 401,
    });
  });

  it("rejects tokens without a Supabase auth user id", async () => {
    const token = await new SignJWT({ role: "authenticated" })
      .setProtectedHeader({ alg: "HS256" })
      .setAudience("authenticated")
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(new TextEncoder().encode(TEST_SECRET));

    await expect(verifySupabaseAccessToken(token)).rejects.toMatchObject({
      status: 401,
    });
  });
});
