import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewEntryFlow } from "./new-entry-flow";

describe("NewEntryFlow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits optional visit time, visitor count, and remarks", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      visitor: { id: "visitor-1" },
      token: "signed-token",
      tokenExpiresAt: "2026-06-08T15:59:59.000Z",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NewEntryFlow
        employees={[
          {
            staffId: "CCSB0698",
            name: "Aina Host",
            department: "AI Projects Lab",
            phone: "0191112222",
            extension: "808",
            email: "aina.host@cryocord.com.my",
          },
        ]}
        vehicles={[]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. WA 18 K"), { target: { value: "cc 100" } });
    fireEvent.click(screen.getByRole("button", { name: /Use/i }));

    fireEvent.change(screen.getByLabelText(/Main visitor name/i), { target: { value: "Nadia Visitor" } });
    fireEvent.change(screen.getByLabelText(/Main visitor contact number/i), { target: { value: "+60123456789" } });
    fireEvent.change(screen.getByLabelText(/Purpose/i), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText(/Visit time/i), { target: { value: "09:30" } });
    fireEvent.change(screen.getByLabelText(/Number of visitors/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Other visitor 1 name"), { target: { value: "Aminah Guest" } });
    fireEvent.change(screen.getByLabelText("Other visitor 2 name"), { target: { value: "Siti Guest" } });
    fireEvent.click(screen.getByRole("button", { name: /Add vehicle/i }));
    fireEvent.change(screen.getByLabelText("Additional vehicle 1"), { target: { value: "cc 101" } });
    fireEvent.change(screen.getByLabelText(/Remarks/i), { target: { value: "Park near loading bay" } });

    expect(screen.getByRole("button", { name: /Log Entry & Issue Pass/i })).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Main visitor NRIC number/i), { target: { value: "900101-14-1234" } });
    expect(screen.getByRole("button", { name: /Log Entry & Issue Pass/i })).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: /Host/i }), { target: { value: "aina" } });
    fireEvent.click(screen.getByRole("button", { name: /Aina Host/i }));

    expect(screen.getByRole("button", { name: /Log Entry & Issue Pass/i })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: /Log Entry & Issue Pass/i }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole("button", { name: /Share QR image/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open WhatsApp text/i })).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/60123456789?text="),
    );
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual(expect.objectContaining({
      vehicleNumber: "CC100",
      additionalVehicleNumbers: ["CC 101"],
      name: "Nadia Visitor",
      phoneNumber: "+60123456789",
      identityType: "nric",
      nric: "900101-14-1234",
      purpose: "other",
      visitTime: "09:30",
      visitorCount: "3",
      otherVisitorNames: ["Aminah Guest", "Siti Guest"],
      remarks: "Park near loading bay",
      hostStaffId: "CCSB0698",
      hostDepartment: "AI Projects Lab",
    }));
  });

  it("blocks issuing a pass for a blacklisted known vehicle", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(
      <NewEntryFlow
        employees={[]}
        vehicles={[
          {
            id: "vehicle-1",
            plate: "BLK 100",
            plateNormalised: "BLK100",
            ownerName: "Blocked Driver",
            ownerContact: "+60111111111",
            ownerType: "visitor",
            notes: "Security incident under review.",
            blacklisted: true,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. WA 18 K"), { target: { value: "blk 100" } });
    fireEvent.click(screen.getByRole("button", { name: /Use/i }));

    expect(screen.getByText("Vehicle is blacklisted. Registration is blocked.")).toBeInTheDocument();
    expect(screen.getByText("Reason: Security incident under review.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Log Entry & Issue Pass/i })).toBeDisabled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows HR host contact details after a host is selected", () => {
    render(
      <NewEntryFlow
        employees={[
          {
            staffId: "CCSB0698",
            name: "Aina Host",
            department: "AI Projects Lab",
            phone: "0191112222",
            extension: "808",
            email: "aina.host@cryocord.com.my",
          },
        ]}
        vehicles={[]}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("e.g. WA 18 K"), { target: { value: "host 100" } });
    fireEvent.click(screen.getByRole("button", { name: /Use/i }));
    fireEvent.change(screen.getByRole("combobox", { name: /Host/i }), { target: { value: "aina" } });

    expect(screen.getByText("Aina Host")).toBeInTheDocument();
    expect(screen.getByText("AI Projects Lab")).toBeInTheDocument();
    expect(screen.getByText("aina.host@cryocord.com.my")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Aina Host/i }));

    expect(screen.getByText("Host contact")).toBeInTheDocument();
    expect(screen.getByText("Aina Host")).toBeInTheDocument();
    expect(screen.getByText("AI Projects Lab")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /WhatsApp 0191112222/i })).toHaveAttribute(
      "href",
      expect.stringContaining("https://wa.me/60191112222?text="),
    );
    expect(screen.getByText("Ext 808")).toBeInTheDocument();
  });
});
