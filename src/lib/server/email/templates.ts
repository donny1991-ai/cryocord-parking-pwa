import "server-only";

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

interface EmailLayoutInput {
  preview: string;
  heading: string;
  bodyHtml: string;
  footerHtml?: string;
}

interface OtpLoginEmailInput {
  otp: string;
  expiresInMinutes: number;
}

const BRAND_NAME = "CryoCord Parking";
const BRAND_RED = "#C8102E";
const INK = "#1F2933";
const MUTED = "#5F6B7A";
const CANVAS = "#F2F2F2";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function renderEmailLayout({ preview, heading, bodyHtml, footerHtml }: EmailLayoutInput) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(heading)}</title>
  </head>
  <body style="margin:0;background:${CANVAS};font-family:Arial,Helvetica,sans-serif;color:${INK};">
    <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preview)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${CANVAS};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #E4E7EB;border-radius:8px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px 16px;border-top:4px solid ${BRAND_RED};">
                <div style="font-size:14px;letter-spacing:0;color:${BRAND_RED};font-weight:700;">${BRAND_NAME}</div>
                <h1 style="margin:18px 0 0;font-size:24px;line-height:1.25;font-weight:700;color:${INK};">${escapeHtml(heading)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:0 28px 28px;font-size:15px;line-height:1.6;color:${INK};">
                ${bodyHtml}
              </td>
            </tr>
            <tr>
              <td style="padding:18px 28px;background:#FAFBFC;border-top:1px solid #E4E7EB;font-size:12px;line-height:1.5;color:${MUTED};">
                ${footerHtml ?? "This message was sent by CryoCord Parking. If you did not request it, you can ignore this email."}
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function renderOtpLoginEmail({ otp, expiresInMinutes }: OtpLoginEmailInput): EmailTemplate {
  const safeOtp = escapeHtml(otp);
  const subject = "Your CryoCord Parking login code";

  return {
    subject,
    text: [
      "Your CryoCord Parking login code",
      "",
      `Code: ${otp}`,
      "",
      `This code expires in ${expiresInMinutes} minutes. Do not share it with anyone.`,
      "",
      "If you did not request this code, you can ignore this email.",
    ].join("\n"),
    html: renderEmailLayout({
      preview: `Your CryoCord Parking login code is ${otp}.`,
      heading: "Your login code",
      bodyHtml: `
        <p style="margin:0 0 16px;">Use this 6-digit code to sign in to the parking console.</p>
        <div style="margin:0 0 18px;padding:18px 20px;background:#F8FAFC;border:1px solid #E4E7EB;border-radius:8px;text-align:center;">
          <div style="font-size:32px;line-height:1.2;letter-spacing:6px;font-weight:700;color:${INK};">${safeOtp}</div>
        </div>
        <p style="margin:0;color:${MUTED};">This code expires in ${expiresInMinutes} minutes. Do not share it with anyone.</p>
      `,
    }),
  };
}
