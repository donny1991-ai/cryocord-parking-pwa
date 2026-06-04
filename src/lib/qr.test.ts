// @vitest-environment node

import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import {
  VISIT_TOKEN_TTL_SECONDS,
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

  it("rejects malformed tokens", async () => {
    await expect(verifyVisitToken("not-a-jwt")).rejects.toThrow();
  });
});
