import "server-only";

import { timingSafeEqual } from "node:crypto";

export function getInternalApiKey() {
  return process.env.PARKING_INTERNAL_API_KEY?.trim() || "";
}

export function getInternalApiCredential(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authorization);
  return (bearerMatch?.[1] || request.headers.get("x-parking-internal-key") || "").trim();
}

export function isInternalApiCredentialValid(actual: string, expected: string) {
  if (!actual || !expected) return false;
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.byteLength !== expectedBuffer.byteLength) return false;
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
