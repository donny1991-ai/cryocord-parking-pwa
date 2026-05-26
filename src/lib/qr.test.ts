// @vitest-environment node

import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";

import { signVisitToken, verifyVisitToken } from "./qr";

const signingKey = new TextEncoder().encode("dev-only-insecure-key-rotate-in-prod");

describe("visit pass tokens", () => {
  it("round-trips a signed visit id", async () => {
    const token = await signVisitToken("visit_123");

    await expect(verifyVisitToken(token)).resolves.toEqual({ visitId: "visit_123" });
  });

  it("rejects a tampered token", async () => {
    const token = await signVisitToken("visit_123");
    const tampered = `${token.slice(0, -1)}${token.endsWith("a") ? "b" : "a"}`;

    await expect(verifyVisitToken(tampered)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const expiredToken = await new SignJWT({ visitId: "visit_123" })
      .setProtectedHeader({ alg: "HS256", kid: "dev" })
      .setIssuedAt()
      .setIssuer("cryocord-parking")
      .setExpirationTime("1s")
      .sign(signingKey);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    await expect(verifyVisitToken(expiredToken)).rejects.toThrow();
  });
});
