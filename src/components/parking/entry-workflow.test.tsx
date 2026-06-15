import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { EntryWorkflow } from "./entry-workflow";

vi.mock("./plate-capture", () => ({
  PlateCapture: () => (
    <div>
      <button type="button">Capture & read plate</button>
      <input aria-label="Vehicle plate" />
    </div>
  ),
}));

describe("EntryWorkflow", () => {
  it("keeps QR arrival available while plate capture is available", () => {
    render(<EntryWorkflow employees={[]} vehicles={[]} />);

    expect(screen.getByRole("button", { name: /QR arrival/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Scan arrival QR/i })).toBeInTheDocument();
    expect(screen.queryByText("Manual vehicle entry")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Plate entry/i }));

    expect(screen.getByRole("button", { name: /Capture & read plate/i })).toBeInTheDocument();
    expect(screen.getByLabelText("Vehicle plate")).toBeInTheDocument();
  });
});
