import type { VisitType } from "./enums";
import { visitTypeLabel } from "./labels";

/**
 * WhatsApp click-to-chat ("wa.me") deep link. This works today with no backend:
 * it opens WhatsApp on the guard's device with the visitor's number and a
 * pre-composed message ready to send. Automated server-side delivery (and
 * attaching the QR image) is the WhatsApp Business API path — see ICS §8.
 */

/** Normalise a Malaysian / international phone to wa.me digits (no +, no separators). */
export function toWaNumber(raw: string): string | null {
  let n = (raw || "").replace(/\D/g, ""); // keep digits only
  if (!n) return null;
  if (n.startsWith("00")) n = n.slice(2); // 00 international prefix
  else if (n.startsWith("0")) n = "60" + n.slice(1); // local MY → +60
  if (n.length < 9 || n.length > 15) return null; // E.164 sanity
  return n;
}

export function buildPassMessage(opts: {
  visitorName: string;
  plate: string;
  visitType: VisitType;
  validUntil: string;
  passUrl?: string;
}): string {
  const lines = [
    "*CryoCord Visitor Pass*",
    `Vehicle: ${opts.plate}`,
    `Visitor: ${opts.visitorName}`,
    `Type: ${visitTypeLabel(opts.visitType)}`,
    `Valid until: ${opts.validUntil}`,
  ];
  if (opts.passUrl) {
    lines.push("", `View & save your gate pass: ${opts.passUrl}`);
  }
  lines.push("", "Please show this pass at the CryoCord gate on arrival.");
  return lines.join("\n");
}

/** Full wa.me link, or null if the contact number isn't usable. */
export function waLink(contact: string, message: string): string | null {
  const number = toWaNumber(contact);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}
