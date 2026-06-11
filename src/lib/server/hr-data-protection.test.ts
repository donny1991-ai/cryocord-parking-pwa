// @vitest-environment node

import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { revealHrProtectedText } from "./hr-data-protection";

const TEST_KEY = "unit-test-hr-data-encryption-key";

function encryptLikeHr(plaintext: string, secret = TEST_KEY) {
  const iv = randomBytes(12);
  const key = createHash("sha256").update(Buffer.from(secret, "utf8")).digest();
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    "enc:v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

describe("revealHrProtectedText", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns plain HR values unchanged", () => {
    expect(revealHrProtectedText(" 0191112222 ")).toBe("0191112222");
  });

  it("decrypts HR encrypted values with HR_APP_DATA_ENCRYPTION_KEY", () => {
    vi.stubEnv("HR_APP_DATA_ENCRYPTION_KEY", TEST_KEY);

    expect(revealHrProtectedText(encryptLikeHr("0191112222"))).toBe("0191112222");
  });

  it("falls back to APP_DATA_ENCRYPTION_KEY", () => {
    vi.stubEnv("APP_DATA_ENCRYPTION_KEY", TEST_KEY);

    expect(revealHrProtectedText(encryptLikeHr("+60 19 111 2222"))).toBe("+60 19 111 2222");
  });

  it("does not expose ciphertext when the key is missing or wrong", () => {
    const encrypted = encryptLikeHr("0191112222");

    expect(revealHrProtectedText(encrypted)).toBeNull();

    vi.stubEnv("HR_APP_DATA_ENCRYPTION_KEY", "wrong-key");
    expect(revealHrProtectedText(encrypted)).toBeNull();
  });
});
