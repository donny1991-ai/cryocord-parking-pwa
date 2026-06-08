import { afterEach, describe, expect, it } from "vitest";
import { getSmtpConfig } from "./smtp";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("SMTP configuration", () => {
  it("keeps TLS certificate validation enabled by default", () => {
    process.env.SMTP_HOST = "mail.example.test";
    process.env.SMTP_USER = "parking@example.test";
    process.env.SMTP_PASS = "secret";
    delete process.env.SMTP_TLS_REJECT_UNAUTHORIZED;

    expect(getSmtpConfig()).toMatchObject({
      host: "mail.example.test",
      username: "parking@example.test",
      tlsRejectUnauthorized: true,
    });
  });

  it("allows SMTP TLS certificate validation to be disabled explicitly", () => {
    process.env.SMTP_HOST = "mail.example.test";
    process.env.SMTP_USER = "parking@example.test";
    process.env.SMTP_PASS = "secret";
    process.env.SMTP_TLS_REJECT_UNAUTHORIZED = "false";

    expect(getSmtpConfig()).toMatchObject({
      tlsRejectUnauthorized: false,
    });
  });
});
