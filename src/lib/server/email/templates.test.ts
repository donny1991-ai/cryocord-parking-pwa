import { describe, expect, it } from "vitest";
import { renderEmailLayout, renderOtpLoginEmail } from "./templates";

describe("email templates", () => {
  it("renders the reusable CryoCord email layout", () => {
    const html = renderEmailLayout({
      preview: "Parking preview",
      heading: "Parking <Admin>",
      bodyHtml: "<p>Body copy</p>",
    });

    expect(html).toContain("CryoCord Parking");
    expect(html).toContain("Parking &lt;Admin&gt;");
    expect(html).toContain("<p>Body copy</p>");
    expect(html).toContain("#C8102E");
  });

  it("renders a 6-digit OTP login email in text and HTML", () => {
    const email = renderOtpLoginEmail({ otp: "123456", expiresInMinutes: 10 });

    expect(email.subject).toBe("Your CryoCord Parking login code");
    expect(email.text).toContain("Code: 123456");
    expect(email.text).toContain("expires in 10 minutes");
    expect(email.html).toContain("123456");
    expect(email.html).toContain("Use this 6-digit code");
  });
});
