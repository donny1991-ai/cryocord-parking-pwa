import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArrivalScanFlow } from "./arrival-scan-flow";

vi.mock("@/lib/camera", () => ({
  checkCameraSupport: () => ({ ok: true, message: null }),
}));

vi.mock("./qr-scanner", () => ({
  QrScanner: ({ onResult }: { onResult: (value: string) => void }) => (
    <button type="button" onClick={() => onResult("signed-token")}>
      Mock scan
    </button>
  ),
}));

describe("ArrivalScanFlow", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("edits registered additional vehicles as individual plate rows", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        visitor: {
          id: "visit-1",
          name: "Nadia Visitor",
          phoneNumber: "0196776100",
          organisation: "Test Company",
          identityType: "nric",
          nric: "900101-14-1234",
          passportNumber: null,
          vehicleNumber: "CAR A",
          additionalVehicleNumbers: ["CAR B"],
          vehicles: [
            {
              id: "vehicle-1",
              vehicleNumber: "CAR A",
              isPrimary: true,
              status: "pending",
              checkedIn: null,
              checkedOut: null,
            },
            {
              id: "vehicle-2",
              vehicleNumber: "CAR B",
              isPrimary: false,
              status: "pending",
              checkedIn: null,
              checkedOut: null,
            },
          ],
          typeCode: "visitor",
          purpose: "meeting",
          remarks: null,
          visitTime: null,
          visitorCount: 1,
          otherVisitorNames: [],
          hostStaffId: "HOST1",
          hostDepartment: "AI Projects Lab",
          host: null,
          flagReason: null,
          checkedIn: null,
          status: "pending",
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        visitor: {
          id: "visit-1",
          name: "Nadia Visitor",
          phoneNumber: "0196776100",
          organisation: "Test Company",
          identityType: "nric",
          nric: "900101-14-1234",
          passportNumber: null,
          vehicleNumber: "CAR A",
          additionalVehicleNumbers: ["CAR B", "CAR C"],
          activeVehicleNumber: "CAR A",
          typeCode: "visitor",
          purpose: "meeting",
          remarks: null,
          visitTime: null,
          visitorCount: 1,
          otherVisitorNames: [],
          hostStaffId: "HOST1",
          hostDepartment: "AI Projects Lab",
          host: null,
          flagReason: null,
          checkedIn: "2026-06-11T05:00:00.000Z",
          status: "checked_in",
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <ArrivalScanFlow
        employees={[
          {
            staffId: "HOST1",
            name: "Aina Host",
            department: "AI Projects Lab",
            phone: "0191112222",
            extension: "808",
            email: "aina.host@cryocord.com.my",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Scan arrival QR/i }));
    fireEvent.click(await screen.findByRole("button", { name: /Mock scan/i }));

    expect(await screen.findByText("Verify arrival")).toBeInTheDocument();
    expect(screen.getByLabelText("Additional vehicle 1")).toHaveValue("CAR B");

    fireEvent.click(screen.getByRole("button", { name: /Add vehicle/i }));
    fireEvent.change(screen.getByLabelText("Additional vehicle 2"), { target: { value: "car c" } });
    fireEvent.click(screen.getAllByRole("button", { name: /Approve/i })[0]);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const [, requestInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual(expect.objectContaining({
      action: "check_in",
      visitor: expect.objectContaining({
        vehicleNumber: "CAR A",
        additionalVehicleNumbers: ["CAR B", "CAR C"],
      }),
    }));
  });
});
