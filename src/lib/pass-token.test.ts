import { describe, expect, it, vi } from "vitest";

import { createDemoPassToken, extractDemoVisitId, extractPassToken } from "./pass-token";

describe("createDemoPassToken", () => {
  it("creates a fresh pass token each time", () => {
    vi.stubGlobal("crypto", { randomUUID: () => "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" });

    const first = createDemoPassToken();
    const second = createDemoPassToken();

    expect(first.token).toMatch(/^cc-pass:v-/);
    expect(second.token).toMatch(/^cc-pass:v-/);
    expect(first.token).not.toBe(second.token);

    vi.unstubAllGlobals();
  });
});

describe("extractPassToken", () => {
  it("extracts encoded tokens from visitor pass URLs", () => {
    expect(extractPassToken("https://parking.example/pass/cc-pass%3Av-123")).toBe("cc-pass:v-123");
  });

  it("passes through raw QR token values", () => {
    expect(extractPassToken("demo.opaque.v-1001")).toBe("demo.opaque.v-1001");
  });
});

describe("extractDemoVisitId", () => {
  it("extracts visit ids from new cc-pass tokens", () => {
    expect(extractDemoVisitId("https://parking.example/pass/cc-pass%3Av-123")).toBe("v-123");
  });

  it("extracts visit ids from legacy demo tokens", () => {
    expect(extractDemoVisitId("demo.opaque.v-1001")).toBe("v-1001");
  });
});
