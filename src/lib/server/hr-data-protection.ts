import "server-only";
import { createDecipheriv, createHash } from "node:crypto";

const ENCRYPTED_VALUE_PREFIX = "enc:v1";

function clean(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function decodeSecret(secret: string): Buffer {
  const normalized = secret.trim();
  if (
    normalized.length >= 32 &&
    normalized.length % 2 === 0 &&
    /^[0-9a-f]+$/i.test(normalized)
  ) {
    return Buffer.from(normalized, "hex");
  }
  return Buffer.from(normalized, "utf8");
}

function getHrProtectionSecret(): string | null {
  return clean(process.env.HR_APP_DATA_ENCRYPTION_KEY) || clean(process.env.APP_DATA_ENCRYPTION_KEY) || null;
}

function getAesKey(secret: string): Buffer {
  return createHash("sha256").update(decodeSecret(secret)).digest();
}

export function revealHrProtectedText(value: string | null | undefined): string | null {
  const normalized = clean(value);
  if (!normalized) return null;
  if (!normalized.startsWith(`${ENCRYPTED_VALUE_PREFIX}:`)) return normalized;

  const secret = getHrProtectionSecret();
  if (!secret) return null;

  const parts = normalized.split(":");
  if (parts.length !== 5) return null;
  const [prefix, version, ivRaw, tagRaw, payloadRaw] = parts;
  if (`${prefix}:${version}` !== ENCRYPTED_VALUE_PREFIX || !ivRaw || !tagRaw || !payloadRaw) {
    return null;
  }

  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      getAesKey(secret),
      Buffer.from(ivRaw, "base64url"),
      { authTagLength: 16 },
    );
    decipher.setAuthTag(Buffer.from(tagRaw, "base64url"));
    return Buffer.concat([
      decipher.update(Buffer.from(payloadRaw, "base64url")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    return null;
  }
}
