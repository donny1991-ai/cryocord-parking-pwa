// @vitest-environment node

import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import {
  VISIT_TOKEN_TTL_SECONDS,
  decodeVisitTokenReference,
  getPreRegistrationTokenExpiresAt,
  signVisitToken,
  verifyVisitToken,
} from "./qr";

describe("visitor QR token", () => {
  it("round-trips only opaque visit references", async () => {
    const token = await signVisitToken("visit-123", "token-456");

    await expect(verifyVisitToken(token)).resolves.toEqual({
      visitId: "visit-123",
      tokenId: "token-456",
      expiresAt: expect.any(String),
    });
  });

  it("does not expose visitor PII in the JWT payload", async () => {
    const token = await signVisitToken("visit-abc", "token-def");
    const payload = decodeJwt(token);

    expect(payload).toMatchObject({ visitId: "visit-abc", jti: "token-def" });
    expect((payload.exp ?? 0) - (payload.iat ?? 0)).toBe(VISIT_TOKEN_TTL_SECONDS);
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("phoneNumber");
    expect(payload).not.toHaveProperty("vehicleNumber");
    expect(payload).not.toHaveProperty("plate");
  });

  it("supports a pre-registration expiry based on the visit date", async () => {
    const issuedAt = new Date("2026-06-03T00:00:00.000Z");
    const expiresAt = getPreRegistrationTokenExpiresAt("2026-06-05");
    const token = await signVisitToken("visit-future", "token-future", issuedAt, expiresAt);
    const payload = decodeJwt(token);

    expect(payload.exp).toBe(Math.floor(expiresAt.getTime() / 1000));
    expect(expiresAt.toISOString()).toBe("2026-06-05T15:59:59.000Z");
  });

  it("can decode a signed expired token when the caller will apply database policy", async () => {
    const token = await signVisitToken(
      "visit-expired-reference",
      "token-expired-reference",
      new Date("2026-06-03T00:00:00.000Z"),
      new Date("2026-06-03T01:00:00.000Z"),
    );

    await expect(verifyVisitToken(token)).rejects.toThrow();
    await expect(verifyVisitToken(token, { ignoreExpiration: true })).resolves.toEqual({
      visitId: "visit-expired-reference",
      tokenId: "token-expired-reference",
      expiresAt: "2026-06-03T01:00:00.000Z",
    });
  });

  it("can decode an opaque reference without trusting signature verification", async () => {
    const originalKey = process.env.PARKING_QR_SIGNING_KEY;
    process.env.PARKING_QR_SIGNING_KEY = "original-test-signing-key";
    const token = await signVisitToken("visit-reference", "token-reference");
    process.env.PARKING_QR_SIGNING_KEY = "rotated-test-signing-key";

    try {
      await expect(verifyVisitToken(token, { ignoreExpiration: true })).rejects.toThrow();
      expect(decodeVisitTokenReference(token)).toMatchObject({
        visitId: "visit-reference",
        tokenId: "token-reference",
        expiresAt: expect.any(String),
      });
    } finally {
      if (originalKey === undefined) {
        delete process.env.PARKING_QR_SIGNING_KEY;
      } else {
        process.env.PARKING_QR_SIGNING_KEY = originalKey;
      }
    }
  });

  it("rejects malformed tokens", async () => {
    await expect(verifyVisitToken("not-a-jwt")).rejects.toThrow();
  });
});
