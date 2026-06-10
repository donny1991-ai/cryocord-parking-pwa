import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { QrPassShareButton } from "./qr-pass-share-button";

describe("QrPassShareButton", () => {
  it("renders WhatsApp text action as an outlined button", () => {
    render(
      <QrPassShareButton
        token="opaque-token"
        plate="DSU123"
        visitorName="Visitor11"
        visitType="visitor"
        validUntil="10 June at 23:59"
        heading="Scan at gate to check in"
        message="Visitor pass"
        whatsappHref="https://wa.me/60123456789?text=Visitor%20pass"
      />,
    );

    expect(screen.getByRole("button", { name: /Share QR image/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open WhatsApp text/i })).toHaveClass("border");
  });
});
