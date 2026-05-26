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

const KEY_ID = process.env.PARKING_QR_KEY_ID ?? "dev";
// Dev-only fallback so the scaffold runs without Key Vault. Real key is injected.
const SIGNING_KEY = new TextEncoder().encode(
  process.env.PARKING_QR_SIGNING_KEY ?? "dev-only-insecure-key-rotate-in-prod",
);

const NINETY_DAYS_S = 90 * 24 * 60 * 60;

export interface PassClaims {
  visitId: string;
}

/** Sign an opaque pass token for a visit. Server-side only. */
export async function signVisitToken(visitId: string): Promise<string> {
  return new SignJWT({ visitId } satisfies PassClaims)
    .setProtectedHeader({ alg: "HS256", kid: KEY_ID })
    .setIssuedAt()
    .setIssuer("cryocord-parking")
    .setExpirationTime(`${NINETY_DAYS_S}s`)
    .sign(SIGNING_KEY);
}

/** Verify + decode a scanned pass token. Throws if invalid/expired. */
export async function verifyVisitToken(token: string): Promise<PassClaims> {
  const { payload } = await jwtVerify(token, SIGNING_KEY, {
    issuer: "cryocord-parking",
  });
  if (typeof payload.visitId !== "string") {
    throw new Error("Pass token missing visitId");
  }
  return { visitId: payload.visitId };
}
