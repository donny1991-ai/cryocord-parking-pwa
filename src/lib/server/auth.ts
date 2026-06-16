import "server-only";
import { jwtVerify, SignJWT } from "jose";
import { ParkingUserSchema, type ParkingUserEntity, type ParkingUserRole } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";

const LOCAL_SUPABASE_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long";
export const SUPABASE_AUTHENTICATED_AUDIENCE = "authenticated";
export const PARKING_SESSION_COOKIE = "parking_session";
export const PARKING_SESSION_EXPIRES_IN = "12h";

export class AuthError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}

export interface AuthenticatedParkingUser {
  id: string;
  name: string;
  role: ParkingUserRole;
}

interface SupabaseJwtClaims {
  sub?: string;
  aud?: string | string[];
  role?: string;
}

function getSupabaseJwtSecret() {
  const secret =
    process.env.NODE_ENV === "test"
      ? process.env.TEST_SUPABASE_JWT_SECRET ?? process.env.SUPABASE_JWT_SECRET
      : process.env.SUPABASE_JWT_SECRET ?? process.env.SUPABASE_AUTH_JWT_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("SUPABASE_JWT_SECRET is required in production.");
  }

  return secret ?? LOCAL_SUPABASE_JWT_SECRET;
}

export async function signParkingAccessToken(userId: string, expiresIn: string = PARKING_SESSION_EXPIRES_IN) {
  return new SignJWT({ role: SUPABASE_AUTHENTICATED_AUDIENCE })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience(SUPABASE_AUTHENTICATED_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(new TextEncoder().encode(getSupabaseJwtSecret()));
}

function getCookieToken(request: Request) {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PARKING_SESSION_COOKIE}=`));

  return match ? decodeURIComponent(match.slice(PARKING_SESSION_COOKIE.length + 1)) : null;
}

function getRequestToken(request: Request) {
  const authorization = request.headers.get("authorization");
  const [scheme, token] = authorization?.split(/\s+/) ?? [];
  if (scheme?.toLowerCase() === "bearer" && token) {
    return token;
  }

  const cookieToken = getCookieToken(request);
  if (cookieToken) {
    return cookieToken;
  }

  throw new AuthError("Authentication is required.", 401);
}

function assertUuid(value: string | undefined) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new AuthError("Authentication token is invalid.", 401);
  }
  return value;
}

function assertSupabaseAudience(claims: SupabaseJwtClaims) {
  const audience = claims.aud;
  const hasAuthenticatedAudience = Array.isArray(audience)
    ? audience.includes(SUPABASE_AUTHENTICATED_AUDIENCE)
    : audience === SUPABASE_AUTHENTICATED_AUDIENCE;

  if (!hasAuthenticatedAudience || claims.role !== SUPABASE_AUTHENTICATED_AUDIENCE) {
    throw new AuthError("Authentication token is invalid.", 401);
  }
}

function toAuthenticatedParkingUser(user: ParkingUserEntity): AuthenticatedParkingUser {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

export async function verifySupabaseAccessToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(getSupabaseJwtSecret()), {
      algorithms: ["HS256"],
    });
    const claims = payload as SupabaseJwtClaims;
    assertSupabaseAudience(claims);
    return assertUuid(claims.sub);
  } catch (error) {
    if (error instanceof AuthError) {
      throw error;
    }
    throw new AuthError("Authentication token is invalid.", 401);
  }
}

export async function getParkingUserForToken(
  token: string,
  allowedRoles: ParkingUserRole[] = ["guard", "admin"],
) {
  const userId = await verifySupabaseAccessToken(token);
  const ds = await getParkingDataSource();
  const user = await ds.manager.findOneBy(ParkingUserSchema, { id: userId, active: true });

  if (!user) {
    throw new AuthError("Parking access is not enabled for this account.", 403);
  }

  if (!allowedRoles.includes(user.role)) {
    throw new AuthError("Parking access is not permitted for this account.", 403);
  }

  return toAuthenticatedParkingUser(user);
}

export async function requireParkingUser(
  request: Request,
  allowedRoles: ParkingUserRole[] = ["guard", "admin"],
) {
  return getParkingUserForToken(getRequestToken(request), allowedRoles);
}

export function authErrorResponse(error: unknown) {
  if (error instanceof AuthError) {
    return { error: error.message, status: error.status };
  }
  return null;
}
