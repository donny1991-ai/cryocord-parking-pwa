// @vitest-environment node

import { describe, expect, it } from "vitest";
import { decodeJwt } from "jose";
import { signVisitToken, verifyVisitToken } from "./qr";

describe("visitor QR token", () => {
  it("round-trips only opaque visit references", async () => {
    const token = await signVisitToken("visit-123", "token-456");

    await expect(verifyVisitToken(token)).resolves.toEqual({
      visitId: "visit-123",
      tokenId: "token-456",
    });
  });

  it("does not expose visitor PII in the JWT payload", async () => {
    const token = await signVisitToken("visit-abc", "token-def");
    const payload = decodeJwt(token);

    expect(payload).toMatchObject({ visitId: "visit-abc", jti: "token-def" });
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("phoneNumber");
    expect(payload).not.toHaveProperty("vehicleNumber");
    expect(payload).not.toHaveProperty("plate");
  });

  it("rejects malformed tokens", async () => {
    await expect(verifyVisitToken("not-a-jwt")).rejects.toThrow();
  });
});
