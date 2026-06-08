import { SignJWT, decodeJwt, jwtVerify } from "jose";

/**
 * QR pass = OPAQUE reference token (ADR D5). The payload carries only a random
 * visit_id + expiry + key id — never the plate, name, or any PII. On scan, the
 * server resolves details from parking.visits. This satisfies the AC
 * "zero PII exposed in client-side logs or URLs".
 *
 * HS256, key in Azure Key Vault, rotated quarterly. `kid` lets a rotation
 * happen without invalidating passes signed under the previous key.
 */

const DEV_SIGNING_KEY = "dev-only-insecure-key-rotate-in-prod";

export const VISIT_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const MALAYSIA_UTC_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface PassClaims {
  visitId: string;
  tokenId?: string;
  expiresAt?: string;
}

export interface VerifyVisitTokenOptions {
  ignoreExpiration?: boolean;
}

export function assertQrSigningConfigured() {
  if (process.env.NODE_ENV === "production" && !process.env.PARKING_QR_SIGNING_KEY) {
    throw new Error("PARKING_QR_SIGNING_KEY is required in production.");
  }
}

function getSigningKey() {
  assertQrSigningConfigured();
  return new TextEncoder().encode(process.env.PARKING_QR_SIGNING_KEY ?? DEV_SIGNING_KEY);
}

function getKeyId() {
  return process.env.PARKING_QR_KEY_ID ?? "dev";
}

export function getVisitTokenExpiresAt(issuedAt: Date = new Date()) {
  return new Date((Math.floor(issuedAt.getTime() / 1000) + VISIT_TOKEN_TTL_SECONDS) * 1000);
}

export function getPreRegistrationTokenExpiresAt(visitDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(visitDate);
  if (!match) {
    throw new Error("Visit date must use YYYY-MM-DD format.");
  }

  const [, year, month, day] = match;
  const yearNumber = Number(year);
  const monthIndex = Number(month) - 1;
  const dayNumber = Number(day);
  const midnightAfterVisitDayInMalaysia = Date.UTC(yearNumber, monthIndex, dayNumber + 1, 0, 0, 0, 0);
  return new Date(midnightAfterVisitDayInMalaysia - MALAYSIA_UTC_OFFSET_MS - 1000);
}

/** Sign an opaque pass token for a visit. Server-side only. */
export async function signVisitToken(
  visitId: string,
  tokenId?: string,
  issuedAt: Date = new Date(),
  expiresAt: Date = getVisitTokenExpiresAt(issuedAt),
): Promise<string> {
  const issuedAtSeconds = Math.floor(issuedAt.getTime() / 1000);
  const expiresAtSeconds = Math.floor(expiresAt.getTime() / 1000);

  return new SignJWT({ visitId } satisfies PassClaims)
    .setProtectedHeader({ alg: "HS256", kid: getKeyId() })
    .setIssuedAt(issuedAtSeconds)
    .setIssuer("cryocord-parking")
    .setJti(tokenId ?? crypto.randomUUID())
    .setExpirationTime(expiresAtSeconds)
    .sign(getSigningKey());
}

/** Verify + decode a scanned pass token. Throws if invalid/expired. */
export async function verifyVisitToken(
  token: string,
  options: VerifyVisitTokenOptions = {},
): Promise<PassClaims> {
  const { payload } = await jwtVerify(token, getSigningKey(), {
    issuer: "cryocord-parking",
    ...(options.ignoreExpiration ? { currentDate: new Date(0) } : {}),
  });
  if (typeof payload.visitId !== "string") {
    throw new Error("Pass token missing visitId");
  }
  return {
    visitId: payload.visitId,
    tokenId: typeof payload.jti === "string" ? payload.jti : undefined,
    expiresAt: typeof payload.exp === "number" ? new Date(payload.exp * 1000).toISOString() : undefined,
  };
}

/**
 * Decode the opaque reference claims without trusting the JWT signature.
 * This is only for routing a token to its DB record. Callers may compare the
 * decoded jti with the stored DB token id for key-rotation resilience, but must
 * not trust mutable claims such as exp unless verification succeeded.
 */
export function decodeVisitTokenReference(token: string): PassClaims {
  const payload = decodeJwt(token);
  if (typeof payload.visitId !== "string") {
    throw new Error("Pass token missing visitId");
  }
  return {
    visitId: payload.visitId,
    tokenId: typeof payload.jti === "string" ? payload.jti : undefined,
    expiresAt: typeof payload.exp === "number" ? new Date(payload.exp * 1000).toISOString() : undefined,
  };
}
