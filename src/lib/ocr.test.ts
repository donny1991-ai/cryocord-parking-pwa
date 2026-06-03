import { describe, expect, it } from "vitest";
import { extractPlateCandidates } from "./ocr";

describe("extractPlateCandidates", () => {
  it("rejects long non-plate text read from nearby documents", () => {
    expect(extractPlateCandidates("KAN D REGULATORY COMPLIANCE STRATEGY ==")).toEqual([]);
  });

  it("extracts compact Malaysian-style plates", () => {
    expect(extractPlateCandidates("JKL4521")).toContain("JKL4521");
    expect(extractPlateCandidates("BMT77")).toContain("BMT77");
    expect(extractPlateCandidates("VIP1")).toContain("VIP1");
  });

  it("joins spaced plate fragments from OCR output", () => {
    expect(extractPlateCandidates("WA 18 K")).toContain("WA18K");
    expect(extractPlateCandidates("TES 3456")).toContain("TES3456");
  });

  it("can find a plate inside labelled OCR text", () => {
    expect(extractPlateCandidates("PLATE WUV 2024")).toContain("WUV2024");
  });
});
