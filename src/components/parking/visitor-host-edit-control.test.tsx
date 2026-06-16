import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisitorHostEditControl } from "./visitor-host-edit-control";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const employees = [
  {
    staffId: "HOST1",
    name: "Muhammad Khalili Asyraf Bin Mohd Kamal",
    department: "AI Projects Lab",
    phone: "019 677 6100",
    extension: "",
    email: "host1@example.com",
  },
  {
    staffId: "HOST2",
    name: "Aina Host",
    department: "Security",
    phone: "0191112222",
    extension: "808",
    email: "aina@example.com",
  },
];

describe("VisitorHostEditControl", () => {
  it("combines host confirmation and host reassignment in one compact card", () => {
    render(
      <VisitorHostEditControl
        visitId="visit-1"
        employees={employees}
        currentHost={employees[0]}
        canEdit
      />,
    );

    expect(screen.getByText("Host")).toBeInTheDocument();
    expect(screen.getByText("Muhammad Khalili Asyraf Bin Mohd Kamal")).toBeInTheDocument();
    expect(screen.getByText("AI Projects Lab")).toBeInTheDocument();
    expect(screen.getByText("019 677 6100")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp Call/i })).toHaveAttribute("href", "https://wa.me/call/60196776100");
    expect(screen.queryByRole("combobox", { name: /Change host/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Change host/i }));

    expect(screen.getByRole("combobox", { name: /Change host/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cancel/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save host change/i })).toBeDisabled();
  });
});
