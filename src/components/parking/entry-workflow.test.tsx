import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntryWorkflow } from "./entry-workflow";

describe("EntryWorkflow", () => {
  it("keeps QR arrival available while plate entry is manual", () => {
    render(<EntryWorkflow employees={[]} vehicles={[]} initialMode="qr" />);

    expect(screen.getByRole("button", { name: /QR arrival/i })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /Scan arrival QR/i })).toBeInTheDocument();
    expect(screen.queryByText("Manual vehicle entry")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Plate entry/i }));

    expect(screen.getByText("Manual vehicle entry")).toBeInTheDocument();
    expect(screen.getByLabelText("Vehicle plate")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Capture & read plate/i })).not.toBeInTheDocument();
  });
});
