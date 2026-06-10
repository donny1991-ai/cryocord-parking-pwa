import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { WallRegistrationQr } from "./wall-registration-qr";

describe("WallRegistrationQr", () => {
  it("shows the configured public registration URL", () => {
    render(<WallRegistrationQr configuredUrl="https://parking.example.com/register" />);

    expect(screen.getByText("Visitor self-registration")).toBeInTheDocument();
    expect(screen.getAllByText("https://parking.example.com/register")).toHaveLength(2);
    expect(screen.getByRole("button", { name: /Print poster/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open form/i })).toHaveAttribute(
      "href",
      "https://parking.example.com/register",
    );
  });
});
