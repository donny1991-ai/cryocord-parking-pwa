import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VisitorRequestsReview } from "./visitor-requests-review";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: vi.fn(),
  }),
}));

describe("VisitorRequestsReview", () => {
  it("shows confirmed host details after selecting a host", () => {
    render(
      <VisitorRequestsReview
        employees={[
          {
            staffId: "CCSB0698",
            name: "Aina Host",
            department: "AI Projects Lab",
            phone: "0191112222",
            email: "aina.host@cryocord.test",
          },
        ]}
        requests={[
          {
            id: "request-1",
            name: "Nadia Visitor",
            phoneNumber: "0196776100",
            identityType: "nric",
            nric: "900101-14-1234",
            vehicleNumber: "WA 18 K",
            vehicleNumberNormalised: "WA18K",
            purpose: "meeting",
            otherVisitorNames: [],
            requestedHostText: "AI Projects Lab",
            status: "submitted",
            createdAt: "2026-06-10T00:00:00.000Z",
            updatedAt: "2026-06-10T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: /Assign host for WA 18 K/i }), {
      target: { value: "aina" },
    });

    expect(screen.queryByText("aina.host@cryocord.test")).not.toBeInTheDocument();
    expect(screen.getAllByText("AI Projects Lab").length).toBeGreaterThanOrEqual(2);

    fireEvent.click(screen.getByRole("button", { name: /Aina Host/i }));

    expect(screen.getByText("Confirmed host")).toBeInTheDocument();
    expect(screen.getByText("Aina Host")).toBeInTheDocument();
    expect(screen.getAllByText("AI Projects Lab").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("0191112222")).toBeInTheDocument();
  });
});
