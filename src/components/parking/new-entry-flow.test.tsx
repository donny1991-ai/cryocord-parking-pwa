import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { NewEntryFlow } from "./new-entry-flow";

const cameraMocks = vi.hoisted(() => ({
  supported: false,
  getCameraStream: vi.fn(),
  stopStream: vi.fn(),
}));

const ocrMocks = vi.hoisted(() => ({
  recognisePlate: vi.fn(),
}));

vi.mock("@/lib/camera", () => ({
  checkCameraSupport: () =>
    cameraMocks.supported
      ? { ok: true }
      : {
          ok: false,
          reason: "unsupported",
          message: "This browser does not expose camera access.",
        },
  describeCameraError: () => "Could not start the camera.",
  getCameraStream: cameraMocks.getCameraStream,
  stopStream: cameraMocks.stopStream,
}));

vi.mock("@/lib/ocr", () => ({
  recognisePlate: ocrMocks.recognisePlate,
}));

describe("NewEntryFlow", () => {
  afterEach(() => {
    cameraMocks.supported = false;
    cameraMocks.getCameraStream.mockReset();
    cameraMocks.stopStream.mockReset();
    ocrMocks.recognisePlate.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("starts with plate camera capture and keeps manual entry available", async () => {
    cameraMocks.supported = true;
    cameraMocks.getCameraStream.mockResolvedValue({ getTracks: () => [] });
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);

    render(<NewEntryFlow employees={[]} vehicles={[]} />);

    expect(await screen.findByRole("button", { name: /Capture & read plate/i })).toBeInTheDocument();
    expect(screen.queryByText("Manual vehicle entry")).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("e.g. WA 18 K")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Use/i })).toBeDisabled();
  });

  it("confirms OCR success and advances to the details form automatically", async () => {
    cameraMocks.supported = true;
    cameraMocks.getCameraStream.mockResolvedValue({ getTracks: () => [] });
    ocrMocks.recognisePlate.mockResolvedValue([{ plate: "PFQ5217", raw: "PFQ 5217", confidence: 0.93 }]);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(640 * 164 * 4) })),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });

    render(<NewEntryFlow employees={[]} vehicles={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Capture & read plate/i }));

    expect(await screen.findByRole("status")).toHaveTextContent("PFQ5217 scanned successfully");
    expect(screen.queryByText(/Couldn't read a plate/i)).not.toBeInTheDocument();

    expect(await screen.findByLabelText(/Main visitor name/i)).toBeInTheDocument();
    expect(screen.getByText("PFQ5217")).toBeInTheDocument();
    expect(screen.getByText("Plate scanned successfully. Complete the visitor details below.")).toBeInTheDocument();
  });

  it("requires review instead of auto-advancing when OCR confidence is low", async () => {
    cameraMocks.supported = true;
    cameraMocks.getCameraStream.mockResolvedValue({ getTracks: () => [] });
    ocrMocks.recognisePlate.mockResolvedValue([{ plate: "PFQ5217", raw: "PFQ 5217", confidence: 0.62 }]);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
      imageSmoothingEnabled: true,
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: new Uint8ClampedArray(640 * 164 * 4) })),
      putImageData: vi.fn(),
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLVideoElement.prototype, "videoWidth", { configurable: true, get: () => 640 });
    Object.defineProperty(HTMLVideoElement.prototype, "videoHeight", { configurable: true, get: () => 480 });

    render(<NewEntryFlow employees={[]} vehicles={[]} />);

    fireEvent.click(await screen.findByRole("button", { name: /Capture & read plate/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("PFQ5217 was detected with low confidence");
    expect(screen.getByPlaceholderText("e.g. WA 18 K")).toHaveValue("PFQ5217");
    expect(screen.getByRole("button", { name: /Use/i })).toBeEnabled();
    expect(screen.queryByLabelText(/Main visitor name/i)).not.toBeInTheDocument();
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
    fireEvent.change(screen.getByLabelText(/Main visitor NRIC number/i), { target: { value: "900101-14-1234" } });
    fireEvent.change(screen.getByLabelText(/Main visitor contact number/i), { target: { value: "+60123456789" } });
    fireEvent.change(screen.getByLabelText(/Company represented/i), { target: { value: "Partner Vendor" } });
    fireEvent.change(screen.getByLabelText(/Purpose/i), { target: { value: "other" } });
    fireEvent.change(screen.getByLabelText(/Visit time/i), { target: { value: "09:30" } });
    fireEvent.change(screen.getByLabelText(/Number of visitors/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Other visitor 1 name"), { target: { value: "Aminah Guest" } });
    fireEvent.change(screen.getByLabelText("Other visitor 2 name"), { target: { value: "Siti Guest" } });
    fireEvent.click(screen.getByRole("button", { name: /Add vehicle/i }));
    fireEvent.change(screen.getByLabelText("Additional vehicle 1"), { target: { value: "cc 101" } });
    fireEvent.change(screen.getByLabelText(/Remarks/i), { target: { value: "Park near loading bay" } });

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
      representingOrganisation: "Partner Vendor",
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

  it("sets purpose to Delivery when Courier is selected", () => {
    render(<NewEntryFlow employees={[]} vehicles={[]} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. WA 18 K"), { target: { value: "cr 100" } });
    fireEvent.click(screen.getByRole("button", { name: /Use/i }));
    fireEvent.change(screen.getByLabelText(/Visit type/i), { target: { value: "courier" } });

    expect(screen.getByLabelText(/^Purpose/i)).toHaveValue("delivery");
    expect(screen.getByLabelText(/^Purpose/i)).toBeEnabled();
  });

  it("does not require a host before issuing a Courier gate entry", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      visitor: { id: "visitor-1" },
      token: "signed-token",
      tokenExpiresAt: "2026-06-08T15:59:59.000Z",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<NewEntryFlow employees={[]} vehicles={[]} />);

    fireEvent.change(screen.getByPlaceholderText("e.g. WA 18 K"), { target: { value: "cr 100" } });
    fireEvent.click(screen.getByRole("button", { name: /Use/i }));
    fireEvent.change(screen.getByLabelText(/Main visitor name/i), { target: { value: "Courier Rider" } });
    fireEvent.change(screen.getByLabelText(/Main visitor NRIC number/i), { target: { value: "900101-14-1234" } });
    fireEvent.change(screen.getByLabelText(/Main visitor contact number/i), { target: { value: "+60123456789" } });
    fireEvent.change(screen.getByLabelText(/Visit type/i), { target: { value: "courier" } });

    const submit = screen.getByRole("button", { name: /Log Entry & Issue Pass/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body).toEqual(expect.objectContaining({
      typeCode: "courier",
      purpose: "delivery",
    }));
    expect(body).not.toHaveProperty("hostStaffId");
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
    expect(screen.getByRole("link", { name: /WhatsApp Call 0191112222/i })).toHaveAttribute(
      "href",
      "https://wa.me/call/60191112222",
    );
    expect(screen.getByText("Ext 808")).toBeInTheDocument();
  });
});
