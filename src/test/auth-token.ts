import { SignJWT } from "jose";
import { SUPABASE_AUTHENTICATED_AUDIENCE } from "@/lib/server/auth";

const LOCAL_SUPABASE_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";

function getTestSupabaseJwtSecret() {
  return process.env.TEST_SUPABASE_JWT_SECRET ?? process.env.SUPABASE_JWT_SECRET ?? LOCAL_SUPABASE_JWT_SECRET;
}

export async function signTestSupabaseAccessToken(userId: string) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("signTestSupabaseAccessToken is only available in tests.");
  }

  return new SignJWT({ role: SUPABASE_AUTHENTICATED_AUDIENCE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(SUPABASE_AUTHENTICATED_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode(getTestSupabaseJwtSecret()));
}
