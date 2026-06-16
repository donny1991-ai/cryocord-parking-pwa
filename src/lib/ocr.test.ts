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

  it("meets the minimum parser accuracy score on noisy OCR text samples", () => {
    const minimumAccuracy = 0.9;
    const samples: Array<{ raw: string; expected: string | null }> = [
      { raw: "PFQ 5217", expected: "PFQ5217" },
      { raw: "P F Q 5217", expected: "PFQ5217" },
      { raw: "WA 18 K", expected: "WA18K" },
      { raw: "W A 18 K", expected: "WA18K" },
      { raw: "TES 3456", expected: "TES3456" },
      { raw: "J K L 4521", expected: "JKL4521" },
      { raw: "ABC 1234 T", expected: "ABC1234T" },
      { raw: "PLATE WUV 2024", expected: "WUV2024" },
      { raw: "VIP 1", expected: "VIP1" },
      { raw: "BMT 77", expected: "BMT77" },
      { raw: "NO PLATE DETECTED", expected: null },
      { raw: "REGULATORY COMPLIANCE STRATEGY", expected: null },
    ];

    const correct = samples.filter(({ raw, expected }) => {
      const candidates = extractPlateCandidates(raw);
      return expected ? candidates.includes(expected) : candidates.length === 0;
    }).length;
    const score = correct / samples.length;

    expect(score).toBeGreaterThanOrEqual(minimumAccuracy);
  });
});
