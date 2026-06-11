import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { WallRegistrationQr } from "./wall-registration-qr";

describe("WallRegistrationQr", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows the configured public registration URL", () => {
    render(<WallRegistrationQr configuredUrl="https://parking.example.com/register" />);

    expect(screen.getByText("Visitor self-registration")).toBeInTheDocument();
    expect(screen.getByText("https://parking.example.com/register")).toBeInTheDocument();
    expect(screen.getByTestId("wall-qr-template-preview")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Print poster/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open form/i })).toHaveAttribute(
      "href",
      "https://parking.example.com/register",
    );
  });

  it("prints the same rendered poster after the template image loads", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);

    const { container } = render(
      <WallRegistrationQr configuredUrl="https://parking.example.com/register" />,
    );

    const poster = screen.getByTestId("wall-qr-template-preview");
    const templateImage = container.querySelector(".wall-qr-template-image") as HTMLImageElement;
    Object.defineProperty(templateImage, "complete", { configurable: true, value: false });

    fireEvent.click(screen.getByRole("button", { name: /Print poster/i }));

    expect(poster).toHaveClass("wall-qr-template-poster-print");
    expect(print).not.toHaveBeenCalled();

    fireEvent.load(templateImage);

    await waitFor(() => {
      expect(print).toHaveBeenCalledTimes(1);
    });
  });
});
