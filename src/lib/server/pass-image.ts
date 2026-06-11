import "server-only";

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import QRCode from "qrcode";
import sharp from "sharp";

export interface VisitorPassImageDetails {
  token: string;
  plate: string;
  additionalPlates?: string[];
  visitorName: string;
  visitTypeLabel: string;
  visitDate: string;
  validUntil: string;
}

const TEMPLATE_WIDTH = 1054;
const TEMPLATE_HEIGHT = 1492;
const QR_X = 321;
const QR_Y = 495;
const QR_SIZE = 414;

let templateBuffer: Buffer | null = null;

async function getTemplateBuffer() {
  if (!templateBuffer) {
    templateBuffer = await readFile(join(process.cwd(), "public/parking/visitor-pass-template.png"));
  }
  return templateBuffer;
}

function escapeSvg(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function truncateForSvg(value: string, maxLength = 48) {
  return value.length > maxLength ? `${value.slice(0, maxLength - 3)}...` : value;
}

const PIXEL_GLYPHS: Record<string, string[]> = {
  " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
  "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
  "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
  "2": ["01110", "10001", "00001", "00010", "00100", "01000", "11111"],
  "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
  "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
  "5": ["11111", "10000", "10000", "11110", "00001", "00001", "11110"],
  "6": ["01110", "10000", "10000", "11110", "10001", "10001", "01110"],
  "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
  "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
  "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
  A: ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
  B: ["11110", "10001", "10001", "11110", "10001", "10001", "11110"],
  C: ["01111", "10000", "10000", "10000", "10000", "10000", "01111"],
  D: ["11110", "10001", "10001", "10001", "10001", "10001", "11110"],
  E: ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
  F: ["11111", "10000", "10000", "11110", "10000", "10000", "10000"],
  G: ["01111", "10000", "10000", "10011", "10001", "10001", "01111"],
  H: ["10001", "10001", "10001", "11111", "10001", "10001", "10001"],
  I: ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
  J: ["00111", "00010", "00010", "00010", "00010", "10010", "01100"],
  K: ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
  L: ["10000", "10000", "10000", "10000", "10000", "10000", "11111"],
  M: ["10001", "11011", "10101", "10101", "10001", "10001", "10001"],
  N: ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
  O: ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
  P: ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
  Q: ["01110", "10001", "10001", "10001", "10101", "10010", "01101"],
  R: ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
  S: ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
  T: ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
  U: ["10001", "10001", "10001", "10001", "10001", "10001", "01110"],
  V: ["10001", "10001", "10001", "10001", "10001", "01010", "00100"],
  W: ["10001", "10001", "10001", "10101", "10101", "10101", "01010"],
  X: ["10001", "10001", "01010", "00100", "01010", "10001", "10001"],
  Y: ["10001", "10001", "01010", "00100", "00100", "00100", "00100"],
  Z: ["11111", "00001", "00010", "00100", "01000", "10000", "11111"],
  ":": ["00000", "00100", "00100", "00000", "00100", "00100", "00000"],
  ".": ["00000", "00000", "00000", "00000", "00000", "01100", "01100"],
  ",": ["00000", "00000", "00000", "00000", "00100", "00100", "01000"],
  "-": ["00000", "00000", "00000", "11111", "00000", "00000", "00000"],
  "/": ["00001", "00010", "00010", "00100", "01000", "01000", "10000"],
  "'": ["00100", "00100", "01000", "00000", "00000", "00000", "00000"],
  "&": ["01100", "10010", "10100", "01000", "10101", "10010", "01101"],
  "+": ["00000", "00100", "00100", "11111", "00100", "00100", "00000"],
  "?": ["01110", "10001", "00001", "00010", "00100", "00000", "00100"],
};

function normalisePixelText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^ A-Z0-9:.,\-/'&+]/g, "?");
}

function renderPixelTextLine(line: string, centerX: number, topY: number, maxWidth: number, maxScale: number) {
  const text = normalisePixelText(truncateForSvg(line, 42));
  const glyphColumns = 5;
  const glyphRows = 7;
  const glyphGap = 1;
  const totalColumns = Math.max(1, text.length * (glyphColumns + glyphGap) - glyphGap);
  const scale = Math.min(maxScale, maxWidth / totalColumns);
  const startX = centerX - (totalColumns * scale) / 2;
  const rects: string[] = [];

  Array.from(text).forEach((character, characterIndex) => {
    const glyph = PIXEL_GLYPHS[character] ?? PIXEL_GLYPHS["?"];
    const glyphX = startX + characterIndex * (glyphColumns + glyphGap) * scale;

    glyph.forEach((row, rowIndex) => {
      Array.from(row).forEach((pixel, columnIndex) => {
        if (pixel !== "1") return;
        rects.push(
          `<rect x="${(glyphX + columnIndex * scale).toFixed(2)}" y="${(topY + rowIndex * scale).toFixed(2)}" width="${scale.toFixed(2)}" height="${scale.toFixed(2)}" fill="#080808"/>`,
        );
      });
    });
  });

  return `<g aria-label="${escapeSvg(line)}">${rects.join("")}</g>`;
}

async function renderQrSvg(token: string) {
  return QRCode.toString(token, {
    type: "svg",
    errorCorrectionLevel: "M",
    margin: 1,
    width: QR_SIZE,
    color: {
      dark: "#000000",
      light: "#FFFFFF",
    },
  });
}

function renderDetailsSvg(details: VisitorPassImageDetails) {
  const lines = [
    `Vehicle: ${details.plate}`,
    ...(details.additionalPlates?.length ? [`Linked: ${details.additionalPlates.join(", ")}`] : []),
    `Visitor: ${details.visitorName}`,
    `Type: ${details.visitTypeLabel}`,
    `Visit date: ${details.visitDate}`,
    `Valid until: ${details.validUntil}`,
  ];
  const lineGap = lines.length > 5 ? 32 : 38;
  const firstLineY = lines.length > 5 ? 978 : 986;
  const maxScale = lines.length > 5 ? 4.1 : 4.5;

  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="${TEMPLATE_WIDTH}" height="${TEMPLATE_HEIGHT}" viewBox="0 0 ${TEMPLATE_WIDTH} ${TEMPLATE_HEIGHT}">
      <rect x="232" y="955" width="590" height="220" fill="#FFFFFF"/>
      ${lines
        .map((line, index) => (
          renderPixelTextLine(line, 527, firstLineY + index * lineGap, 560, maxScale)
        ))
        .join("")}
    </svg>
  `;
}

export async function renderVisitorPassImagePng(details: VisitorPassImageDetails) {
  const template = await getTemplateBuffer();
  const qrSvg = await renderQrSvg(details.token);
  const detailsSvg = renderDetailsSvg(details);

  return sharp(template)
    .composite([
      {
        input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${TEMPLATE_WIDTH}" height="${TEMPLATE_HEIGHT}"><rect x="318" y="492" width="420" height="420" fill="#FFFFFF"/></svg>`),
        left: 0,
        top: 0,
      },
      {
        input: Buffer.from(qrSvg),
        left: QR_X,
        top: QR_Y,
      },
      {
        input: Buffer.from(detailsSvg),
        left: 0,
        top: 0,
      },
    ])
    .png()
    .toBuffer();
}

export function visitorPassImageFilename(plate: string) {
  const safePlate = plate.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "visitor";
  return `cryocord-pass-${safePlate}.png`;
}
