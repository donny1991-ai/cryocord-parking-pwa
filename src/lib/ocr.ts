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

type OcrLine = { text: string; confidence: number };
type OcrResult = { data: { text?: string; lines: OcrLine[] } };

const PLATE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function preprocessPlateCanvas(canvas: HTMLCanvasElement): HTMLCanvasElement {
  const prepared = document.createElement("canvas");
  const sourceWidth = canvas.width;
  const sourceHeight = canvas.height;
  const scale = Math.max(1, Math.ceil(1200 / sourceWidth));
  prepared.width = sourceWidth * scale;
  prepared.height = sourceHeight * scale;

  const ctx = prepared.getContext("2d", { willReadFrequently: true });
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(canvas, 0, 0, prepared.width, prepared.height);

  const image = ctx.getImageData(0, 0, prepared.width, prepared.height);
  const pixels = image.data;
  const histogram = new Array<number>(256).fill(0);

  for (let i = 0; i < pixels.length; i += 4) {
    const grey = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
    histogram[grey]++;
  }

  const threshold = otsuThreshold(histogram, prepared.width * prepared.height);

  for (let i = 0; i < pixels.length; i += 4) {
    const grey = Math.round(pixels[i] * 0.299 + pixels[i + 1] * 0.587 + pixels[i + 2] * 0.114);
    // Slight contrast boost before binarising helps thin plate strokes survive.
    const boosted = Math.max(0, Math.min(255, (grey - 128) * 1.35 + 128));
    const value = boosted > threshold ? 255 : 0;
    pixels[i] = value;
    pixels[i + 1] = value;
    pixels[i + 2] = value;
    pixels[i + 3] = 255;
  }

  ctx.putImageData(image, 0, 0);
  return prepared;
}

function otsuThreshold(histogram: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < histogram.length; i++) sum += i * histogram[i];

  let sumBackground = 0;
  let weightBackground = 0;
  let bestVariance = 0;
  let threshold = 128;

  for (let i = 0; i < histogram.length; i++) {
    weightBackground += histogram[i];
    if (weightBackground === 0) continue;

    const weightForeground = total - weightBackground;
    if (weightForeground === 0) break;

    sumBackground += i * histogram[i];
    const meanBackground = sumBackground / weightBackground;
    const meanForeground = (sum - sumBackground) / weightForeground;
    const variance =
      weightBackground * weightForeground * (meanBackground - meanForeground) * (meanBackground - meanForeground);

    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = i;
    }
  }

  return threshold;
}

function extractCandidates(lines: OcrLine[], fallbackText = ""): PlateCandidate[] {
  const sourceLines = lines.length > 0 ? lines : [{ text: fallbackText, confidence: 45 }];
  const candidates = new Map<string, PlateCandidate>();

  for (const line of sourceLines) {
    const chunks = line.text
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, " ")
      .split(/\s+/)
      .filter(Boolean);
    const combined = chunks.join("");
    const variants = [combined, ...chunks].filter(Boolean);

    for (const raw of variants) {
      const plate = normalisePlate(raw);
      if (!isLikelyPlate(plate)) continue;
      const confidence = scorePlate(plate, line.confidence / 100);
      const existing = candidates.get(plate);
      if (!existing || existing.confidence < confidence) {
        candidates.set(plate, { raw: line.text.trim(), plate, confidence });
      }
    }
  }

  return [...candidates.values()].sort((a, b) => b.confidence - a.confidence).slice(0, 3);
}

function isLikelyPlate(plate: string): boolean {
  return plate.length >= 3 && plate.length <= 10 && /[A-Z]/.test(plate) && /\d/.test(plate);
}

function scorePlate(plate: string, ocrConfidence: number): number {
  const lengthScore = plate.length >= 5 && plate.length <= 8 ? 0.12 : 0;
  const startsWithLetters = /^[A-Z]{1,4}\d/.test(plate) ? 0.12 : 0;
  const mixedScore = /[A-Z]/.test(plate) && /\d/.test(plate) ? 0.08 : 0;
  return Math.min(1, ocrConfidence + lengthScore + startsWithLetters + mixedScore);
}

/** Run on-device OCR over a captured frame (canvas/blob/dataURL). */
export async function recognisePlate(
  image: HTMLCanvasElement | Blob | string,
): Promise<PlateCandidate[]> {
  const ocrImage = image instanceof HTMLCanvasElement ? preprocessPlateCanvas(image) : image;
  const mod = await import("tesseract.js");
  // Loosely typed: tessedit_* params are accepted at runtime but not in the d.ts.
  const recognize = mod.default.recognize as unknown as (
    image: unknown,
    langs?: string,
    options?: Record<string, unknown>,
  ) => Promise<OcrResult>;

  const { data } = await recognize(ocrImage, "eng", {
    // Malaysian plates: uppercase alphanumerics only.
    tessedit_char_whitelist: PLATE_CHARS,
    tessedit_pageseg_mode: "7",
    preserve_interword_spaces: "0",
  });

  return extractCandidates(data.lines, data.text);
}
