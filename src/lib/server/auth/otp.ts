import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { IsNull, type EntityManager } from "typeorm";
import { AuthOtpSchema, ParkingUserSchema, type AuthOtpEntity, type ParkingUserEntity } from "@/db/entities";
import { getParkingDataSource } from "@/db/client";
import { AuthError, signParkingAccessToken } from "@/lib/server/auth";
import { renderOtpLoginEmail, sendEmail } from "@/lib/server/email";

export const OTP_LENGTH = 6;
export const OTP_TTL_MINUTES = 10;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_SECONDS = 60;

interface RequestLoginOtpInput {
  email: string;
}

interface VerifyLoginOtpInput {
  email: string;
  otp: string;
}

interface RequestLoginOtpOptions {
  now?: Date;
  otp?: string;
}

interface VerifyLoginOtpOptions {
  now?: Date;
}

export interface VerifyLoginOtpResult {
  accessToken: string;
  tokenType: "Bearer";
  expiresIn: number;
  user: {
    id: string;
    name: string;
    role: ParkingUserEntity["role"];
  };
}

const GENERIC_OTP_REQUEST_MESSAGE = "If this email has parking access, a login code has been sent.";
const ACCESS_TOKEN_EXPIRES_IN_SECONDS = 12 * 60 * 60;

function getOtpSecret() {
  const secret =
    process.env.AUTH_OTP_SECRET ??
    process.env.SUPABASE_JWT_SECRET ??
    process.env.SUPABASE_AUTH_JWT_SECRET;

  if (!secret && process.env.NODE_ENV === "production") {
    throw new Error("AUTH_OTP_SECRET or SUPABASE_JWT_SECRET is required in production.");
  }

  return secret ?? "super-secret-jwt-token-with-at-least-32-characters-long";
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function assertEmail(email: unknown) {
  if (typeof email !== "string") {
    throw new AuthError("A valid email is required.", 400);
  }

  const normalized = normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 320) {
    throw new AuthError("A valid email is required.", 400);
  }

  return normalized;
}

function assertOtp(otp: unknown) {
  if (typeof otp !== "string") {
    throw new AuthError("A 6-digit login code is required.", 400);
  }

  const normalized = otp.trim();
  if (!/^\d{6}$/.test(normalized)) {
    throw new AuthError("A 6-digit login code is required.", 400);
  }

  return normalized;
}

function generateOtp() {
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
}

function hashOtp(email: string, otp: string) {
  return createHmac("sha256", getOtpSecret()).update(`${email}:${otp}`).digest("hex");
}

function otpMatches(email: string, otp: string, expectedHash: string) {
  const actual = Buffer.from(hashOtp(email, otp), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function findActiveParkingUserByEmail(manager: EntityManager, email: string) {
  const rows = await manager.query(
    `
      SELECT pu."id"
      FROM "parking"."users" pu
      INNER JOIN "auth"."users" au ON au."id" = pu."id"
      WHERE lower(au."email") = $1
        AND pu."active" = true
      LIMIT 1
    `,
    [email],
  );

  const id = rows[0]?.id;
  if (!id) {
    return null;
  }

  return manager.findOneBy(ParkingUserSchema, { id, active: true });
}

function toAuthUser(user: ParkingUserEntity) {
  return {
    id: user.id,
    name: user.name,
    role: user.role,
  };
}

function isExpired(otp: AuthOtpEntity, now: Date) {
  return otp.expiresAt.getTime() <= now.getTime();
}

function isInsideResendCooldown(otp: AuthOtpEntity, now: Date) {
  return now.getTime() - otp.createdAt.getTime() < OTP_RESEND_COOLDOWN_SECONDS * 1000;
}

export async function requestLoginOtp(
  input: RequestLoginOtpInput,
  options: RequestLoginOtpOptions = {},
) {
  const email = assertEmail(input.email);
  const now = options.now ?? new Date();
  const ds = await getParkingDataSource();
  const user = await findActiveParkingUserByEmail(ds.manager, email);

  if (!user) {
    return { message: GENERIC_OTP_REQUEST_MESSAGE };
  }

  const latestActiveOtp = await ds.manager.findOne(AuthOtpSchema, {
    where: { email, consumedAt: IsNull() },
    order: { createdAt: "DESC" },
  });
  if (latestActiveOtp && !isExpired(latestActiveOtp, now) && isInsideResendCooldown(latestActiveOtp, now)) {
    return { message: GENERIC_OTP_REQUEST_MESSAGE };
  }

  const otp = options.otp ?? generateOtp();
  const expiresAt = new Date(now.getTime() + OTP_TTL_MINUTES * 60 * 1000);

  await ds.manager.transaction(async (manager) => {
    await manager.update(AuthOtpSchema, { email, consumedAt: IsNull() }, { consumedAt: now });
    await manager.insert(AuthOtpSchema, {
      userId: user.id,
      email,
      otpHash: hashOtp(email, otp),
      attempts: 0,
      expiresAt,
      consumedAt: null,
    });
  });

  const template = renderOtpLoginEmail({ otp, expiresInMinutes: OTP_TTL_MINUTES });
  try {
    await sendEmail({
      to: email,
      subject: template.subject,
      text: template.text,
      html: template.html,
    });
  } catch (error) {
    await ds.manager.update(AuthOtpSchema, { email, consumedAt: IsNull() }, { consumedAt: now });
    console.error("OTP email delivery failed.", error);
    throw new AuthError("Login code could not be sent. Please check SMTP configuration.", 503);
  }

  return { message: GENERIC_OTP_REQUEST_MESSAGE };
}

export async function verifyLoginOtp(
  input: VerifyLoginOtpInput,
  options: VerifyLoginOtpOptions = {},
): Promise<VerifyLoginOtpResult> {
  const email = assertEmail(input.email);
  const otp = assertOtp(input.otp);
  const now = options.now ?? new Date();
  const ds = await getParkingDataSource();

  return ds.manager.transaction(async (manager) => {
    const issuedOtp = await manager.findOne(AuthOtpSchema, {
      where: { email, consumedAt: IsNull() },
      order: { createdAt: "DESC" },
    });

    if (!issuedOtp || isExpired(issuedOtp, now) || issuedOtp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new AuthError("Invalid or expired login code.", 401);
    }

    if (!otpMatches(email, otp, issuedOtp.otpHash)) {
      issuedOtp.attempts += 1;
      if (issuedOtp.attempts >= OTP_MAX_ATTEMPTS) {
        issuedOtp.consumedAt = now;
      }
      await manager.save(AuthOtpSchema, issuedOtp);
      throw new AuthError("Invalid or expired login code.", 401);
    }

    const user = await manager.findOneBy(ParkingUserSchema, { id: issuedOtp.userId, active: true });
    if (!user) {
      throw new AuthError("Parking access is not enabled for this account.", 403);
    }

    issuedOtp.consumedAt = now;
    await manager.save(AuthOtpSchema, issuedOtp);

    return {
      accessToken: await signParkingAccessToken(user.id),
      tokenType: "Bearer",
      expiresIn: ACCESS_TOKEN_EXPIRES_IN_SECONDS,
      user: toAuthUser(user),
    };
  });
}
