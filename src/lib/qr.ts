import { SignJWT, jwtVerify } from "jose";

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

const NINETY_DAYS_S = 90 * 24 * 60 * 60;

export interface PassClaims {
  visitId: string;
  tokenId?: string;
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

/** Sign an opaque pass token for a visit. Server-side only. */
export async function signVisitToken(visitId: string, tokenId?: string): Promise<string> {
  return new SignJWT({ visitId } satisfies PassClaims)
    .setProtectedHeader({ alg: "HS256", kid: getKeyId() })
    .setIssuedAt()
    .setIssuer("cryocord-parking")
    .setJti(tokenId ?? crypto.randomUUID())
    .setExpirationTime(`${NINETY_DAYS_S}s`)
    .sign(getSigningKey());
}

/** Verify + decode a scanned pass token. Throws if invalid/expired. */
export async function verifyVisitToken(token: string): Promise<PassClaims> {
  const { payload } = await jwtVerify(token, getSigningKey(), {
    issuer: "cryocord-parking",
  });
  if (typeof payload.visitId !== "string") {
    throw new Error("Pass token missing visitId");
  }
  return {
    visitId: payload.visitId,
    tokenId: typeof payload.jti === "string" ? payload.jti : undefined,
  };
}
