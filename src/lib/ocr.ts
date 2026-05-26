import { normalisePlate } from "./utils";

/**
 * Plate OCR (ADR D3). v1 PRIMARY is on-device Tesseract.js — no image leaves
 * the device/datastore boundary, so no cross-border egress and no TIA.
 * Google Cloud Vision is intentionally NOT wired here; it is reconsidered only
 * behind a filed, DPO-accepted Transfer Impact Assessment.
 *
 * tesseract.js is heavy and browser-only, so it is dynamically imported on
 * first use rather than at module load.
 */

export interface PlateCandidate {
  plate: string; // normalised
  raw: string;
  confidence: number; // 0..1
}

type OcrResult = { data: { lines: Array<{ text: string; confidence: number }> } };

/** Run on-device OCR over a captured frame (canvas/blob/dataURL). */
export async function recognisePlate(
  image: HTMLCanvasElement | Blob | string,
): Promise<PlateCandidate[]> {
  const mod = await import("tesseract.js");
  // Loosely typed: tessedit_* params are accepted at runtime but not in the d.ts.
  const recognize = mod.default.recognize as unknown as (
    image: unknown,
    langs?: string,
    options?: Record<string, unknown>,
  ) => Promise<OcrResult>;

  const { data } = await recognize(image, "eng", {
    // Malaysian plates: uppercase alphanumerics only.
    tessedit_char_whitelist: "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ",
  });

  return data.lines
    .map((l) => ({
      raw: l.text.trim(),
      plate: normalisePlate(l.text),
      confidence: l.confidence / 100,
    }))
    .filter((c) => c.plate.length >= 3 && c.confidence > 0.4)
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}
