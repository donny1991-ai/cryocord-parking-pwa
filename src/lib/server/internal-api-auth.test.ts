import { describe, expect, it } from "vitest";
import { getInternalApiCredential, isInternalApiCredentialValid } from "./internal-api-auth";

describe("internal API auth", () => {
  it("accepts bearer credentials using constant-time comparison", () => {
    const request = new Request("https://parking.test/api/internal/pass-image", {
      headers: { authorization: "Bearer shared-secret" },
    });

    expect(getInternalApiCredential(request)).toBe("shared-secret");
    expect(isInternalApiCredentialValid("shared-secret", "shared-secret")).toBe(true);
    expect(isInternalApiCredentialValid("wrong-secret", "shared-secret")).toBe(false);
  });

  it("falls back to the internal key header", () => {
    const request = new Request("https://parking.test/api/internal/pass-image", {
      headers: { "x-parking-internal-key": "header-secret" },
    });

    expect(getInternalApiCredential(request)).toBe("header-secret");
  });
});
