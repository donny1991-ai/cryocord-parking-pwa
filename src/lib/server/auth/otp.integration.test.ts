import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AppDataSource } from "@/db/data-source";
import { AuthOtpSchema } from "@/db/entities";
import { POST as requestOtpEndpoint } from "@/app/api/auth/otp/request/route";
import { POST as verifyOtpEndpoint } from "@/app/api/auth/otp/verify/route";
import { refreshParkingTestDatabase } from "@/test/refresh-database";
import { seedAuthParkingUser } from "@/db/seeders/auth-user.seeder";
import { verifySupabaseAccessToken } from "@/lib/server/auth";
import { setEmailTransportForTesting, type EmailMessage } from "@/lib/server/email";

function jsonRequest(path: string, body: unknown) {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function getOtpFromMessage(message: EmailMessage) {
  const match = message.text.match(/Code: (\d{6})/);
  if (!match) {
    throw new Error("OTP was not rendered in the test email.");
  }
  return match[1];
}

describe("OTP authentication flow", () => {
  const sentMessages: EmailMessage[] = [];
  const sendMock = vi.fn(async (message: EmailMessage) => {
    sentMessages.push(message);
  });

  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  beforeEach(async () => {
    await refreshParkingTestDatabase(AppDataSource);
    sentMessages.length = 0;
    sendMock.mockClear();
    setEmailTransportForTesting({ send: sendMock });
  });

  afterEach(() => {
    setEmailTransportForTesting(null);
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it("sends a login OTP to an active admin and verifies it for a bearer token", async () => {
    const admin = await seedAuthParkingUser(AppDataSource.manager, {
      email: "admin@parking.test",
      name: "Parking Super Admin",
      role: "admin",
      isSuperAdmin: true,
    });

    const requestResponse = await requestOtpEndpoint(
      jsonRequest("/api/auth/otp/request", { email: " ADMIN@parking.test " }),
    );

    expect(requestResponse.status).toBe(200);
    expect(await requestResponse.json()).toEqual({
      message: "If this email has parking access, a login code has been sent.",
    });
    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(sentMessages[0]).toMatchObject({
      to: "admin@parking.test",
      subject: "Your CryoCord Parking login code",
    });

    const otp = getOtpFromMessage(sentMessages[0]);
    const verifyResponse = await verifyOtpEndpoint(
      jsonRequest("/api/auth/otp/verify", { email: "admin@parking.test", otp }),
    );

    expect(verifyResponse.status).toBe(200);
    const payload = await verifyResponse.json();
    expect(payload).toMatchObject({
      tokenType: "Bearer",
      expiresIn: 43_200,
      user: {
        id: admin.id,
        name: "Parking Super Admin",
        role: "admin",
      },
    });
    expect(await verifySupabaseAccessToken(payload.accessToken)).toBe(admin.id);

    const storedOtp = await AppDataSource.manager.findOneByOrFail(AuthOtpSchema, { email: "admin@parking.test" });
    expect(storedOtp.consumedAt).toEqual(expect.any(Date));
  });

  it("returns the generic request response without sending mail for unknown users", async () => {
    const response = await requestOtpEndpoint(
      jsonRequest("/api/auth/otp/request", { email: "unknown@parking.test" }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      message: "If this email has parking access, a login code has been sent.",
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it("rate-limits repeated OTP requests for the same active user", async () => {
    await seedAuthParkingUser(AppDataSource.manager, {
      email: "guard@parking.test",
      name: "Parking Guard",
      role: "guard",
    });

    const first = await requestOtpEndpoint(
      jsonRequest("/api/auth/otp/request", { email: "guard@parking.test" }),
    );
    const second = await requestOtpEndpoint(
      jsonRequest("/api/auth/otp/request", { email: "guard@parking.test" }),
    );

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(sendMock).toHaveBeenCalledTimes(1);

    const storedOtps = await AppDataSource.manager.countBy(AuthOtpSchema, { email: "guard@parking.test" });
    expect(storedOtps).toBe(1);
  });

  it("returns a controlled service error when email delivery fails", async () => {
    await seedAuthParkingUser(AppDataSource.manager, {
      email: "admin@parking.test",
      name: "Parking Super Admin",
      role: "admin",
    });
    sendMock.mockRejectedValueOnce(new Error("SMTP_PASS is required to send email."));

    const response = await requestOtpEndpoint(
      jsonRequest("/api/auth/otp/request", { email: "admin@parking.test" }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Login code could not be sent. Please check SMTP configuration.",
    });

    const storedOtp = await AppDataSource.manager.findOneByOrFail(AuthOtpSchema, { email: "admin@parking.test" });
    expect(storedOtp.consumedAt).toEqual(expect.any(Date));
  });

  it("rejects invalid or already-consumed OTP codes", async () => {
    await seedAuthParkingUser(AppDataSource.manager, {
      email: "guard@parking.test",
      name: "Parking Guard",
      role: "guard",
    });

    await requestOtpEndpoint(jsonRequest("/api/auth/otp/request", { email: "guard@parking.test" }));
    const otp = getOtpFromMessage(sentMessages[0]);
    const wrongOtp = otp === "000000" ? "111111" : "000000";

    const badResponse = await verifyOtpEndpoint(
      jsonRequest("/api/auth/otp/verify", { email: "guard@parking.test", otp: wrongOtp }),
    );
    expect(badResponse.status).toBe(401);

    const goodResponse = await verifyOtpEndpoint(
      jsonRequest("/api/auth/otp/verify", { email: "guard@parking.test", otp }),
    );
    expect(goodResponse.status).toBe(200);

    const replayResponse = await verifyOtpEndpoint(
      jsonRequest("/api/auth/otp/verify", { email: "guard@parking.test", otp }),
    );
    expect(replayResponse.status).toBe(401);
  });
});
