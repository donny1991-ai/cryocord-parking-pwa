import "server-only";
import { createSmtpEmailTransport, type EmailMessage, type EmailTransport } from "./smtp";

let testTransport: EmailTransport | null = null;

export function setEmailTransportForTesting(transport: EmailTransport | null) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setEmailTransportForTesting is only available in tests.");
  }
  testTransport = transport;
}

export async function sendEmail(message: EmailMessage) {
  const transport = testTransport ?? createSmtpEmailTransport();
  await transport.send(message);
}

export type { EmailMessage, EmailTransport };
export { createSmtpEmailTransport } from "./smtp";
export { renderEmailLayout, renderOtpLoginEmail, type EmailTemplate } from "./templates";
