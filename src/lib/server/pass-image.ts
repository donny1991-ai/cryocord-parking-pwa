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
const DETAILS_X = 232;
const DETAILS_Y = 955;
const DETAILS_WIDTH = 590;
const DETAILS_HEIGHT = 220;
const DETAILS_CENTER_X = DETAILS_X + DETAILS_WIDTH / 2;
const TEXT_FONT_PATH = join(process.cwd(), "node_modules/next/dist/compiled/@vercel/og/Geist-Regular.ttf");

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

export function linkedVehicleSummary(additionalPlates: string[] | undefined) {
  const count = additionalPlates?.length ?? 0;
  if (count === 0) return null;
  return `+${count} vehicle${count === 1 ? "" : "s"}`;
}

function detailLines(details: VisitorPassImageDetails) {
  const linked = linkedVehicleSummary(details.additionalPlates);
  return [
    `Vehicle: ${details.plate}`,
    linked ? `Linked: ${linked}` : null,
    `Visitor: ${details.visitorName}`,
    `Type: ${details.visitTypeLabel}`,
    `Visit date: ${details.visitDate}`,
    `Valid until: ${details.validUntil}`,
  ].filter((line): line is string => Boolean(line));
}

function formatDetailLine(line: string) {
  const [label, ...rest] = line.split(":");
  const value = rest.join(":").trim();
  if (!value) return escapeSvg(truncateForSvg(line, 42));

  return [
    `<span foreground="#6B7280">${escapeSvg(`${label.toUpperCase()}:`)}</span>`,
    `<span foreground="#111827">${escapeSvg(truncateForSvg(value, 34))}</span>`,
  ].join("  ");
}

function ensureFontConfigCache() {
  process.env.XDG_CACHE_HOME ||= "/tmp";
}

async function renderDetailTextLine(line: string) {
  ensureFontConfigCache();
  const text = await sharp({
    text: {
      text: formatDetailLine(line),
      font: "Geist 31",
      fontfile: TEXT_FONT_PATH,
      width: 560,
      align: "center",
      rgba: true,
      wrap: "none",
    },
  })
    .png()
    .toBuffer();
  const metadata = await sharp(text).metadata();
  return {
    input: text,
    width: metadata.width ?? 0,
    height: metadata.height ?? 0,
  };
}

async function renderDetailTextComposites(details: VisitorPassImageDetails) {
  const lines = [
    {
      input: Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${TEMPLATE_WIDTH}" height="${TEMPLATE_HEIGHT}"><rect x="${DETAILS_X}" y="${DETAILS_Y}" width="${DETAILS_WIDTH}" height="${DETAILS_HEIGHT}" fill="#FFFFFF"/></svg>`,
      ),
      left: 0,
      top: 0,
    },
  ];
  const renderedLines = await Promise.all(detailLines(details).map(renderDetailTextLine));
  const lineGap = renderedLines.length > 5 ? 35 : 40;
  const firstCenterY = renderedLines.length > 5 ? 988 : 1001;

  return [
    ...lines,
    ...renderedLines.map((line, index) => ({
      input: line.input,
      left: Math.round(DETAILS_CENTER_X - line.width / 2),
      top: Math.round(firstCenterY + index * lineGap - line.height / 2),
    })),
  ];
}

export async function renderVisitorPassImagePng(details: VisitorPassImageDetails) {
  const template = await getTemplateBuffer();
  const qrSvg = await renderQrSvg(details.token);
  const detailComposites = await renderDetailTextComposites(details);

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
      ...detailComposites,
    ])
    .png()
    .toBuffer();
}

export function visitorPassImageFilename(plate: string) {
  const safePlate = plate.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "visitor";
  return `cryocord-pass-${safePlate}.png`;
}
