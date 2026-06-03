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

const MAX_OCR_PLATE_LENGTH = 8;
const MIN_OCR_CONFIDENCE = 0.4;
const PLATE_SHAPE = /^[A-Z]{1,4}\d{1,4}[A-Z]{0,2}$/;

function normaliseOcrToken(text: string) {
  return text.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function looksLikePlate(token: string) {
  return (
    token.length >= 3 &&
    token.length <= MAX_OCR_PLATE_LENGTH &&
    /[A-Z]/.test(token) &&
    /\d/.test(token) &&
    PLATE_SHAPE.test(token)
  );
}

export function extractPlateCandidates(rawText: string) {
  const words = rawText.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const candidates = new Set<string>();

  for (let start = 0; start < words.length; start += 1) {
    let combined = "";
    for (let end = start; end < words.length; end += 1) {
      combined += words[end];
      if (combined.length > MAX_OCR_PLATE_LENGTH) break;
      if (looksLikePlate(combined)) candidates.add(combined);
    }
  }

  const compact = normaliseOcrToken(rawText);
  if (looksLikePlate(compact)) candidates.add(compact);

  return [...candidates];
}

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
    tessedit_pageseg_mode: "7",
    preserve_interword_spaces: "1",
    user_defined_dpi: "300",
  });

  return data.lines
    .flatMap((l) => {
      const confidence = l.confidence / 100;
      if (confidence <= MIN_OCR_CONFIDENCE) return [];

      return extractPlateCandidates(l.text).map((plate) => ({
        raw: l.text.trim(),
        plate: normalisePlate(plate),
        confidence,
      }));
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3);
}
