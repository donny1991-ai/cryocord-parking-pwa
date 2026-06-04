import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

function renderDialog(overrides: Partial<ComponentProps<typeof ConfirmDialog>> = {}) {
  const onConfirm = vi.fn();
  const onOpenChange = vi.fn();

  render(
    <ConfirmDialog
      open
      title="Cancel pending visit?"
      description="Cancelling will disable the shared QR pass link."
      confirmLabel="Cancel visit"
      cancelLabel="Keep visit"
      onConfirm={onConfirm}
      onOpenChange={onOpenChange}
      {...overrides}
    />,
  );

  return { onConfirm, onOpenChange };
}

describe("ConfirmDialog", () => {
  it("renders an accessible confirmation dialog", () => {
    renderDialog();

    expect(screen.getByRole("dialog", { name: "Cancel pending visit?" })).toBeInTheDocument();
    expect(screen.getByText("Cancelling will disable the shared QR pass link.")).toBeInTheDocument();
  });

  it("closes when the cancel button is pressed", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Keep visit" }));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("runs the confirm action when the confirm button is pressed", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderDialog();

    await user.click(screen.getByRole("button", { name: "Cancel visit" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("closes with Escape when not busy", async () => {
    const user = userEvent.setup();
    const { onOpenChange } = renderDialog();

    await user.keyboard("{Escape}");

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
