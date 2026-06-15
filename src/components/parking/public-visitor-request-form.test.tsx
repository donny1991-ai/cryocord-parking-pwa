import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PublicVisitorRequestForm } from "./public-visitor-request-form";

describe("PublicVisitorRequestForm", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("submits a public visitor request with free-text host and one vehicle", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      visitor: { id: "visit-1", name: "Nadia Visitor", vehicleNumber: "WA 18 K" },
      token: "signed-token",
      tokenExpiresAt: "2026-06-08T15:59:59.000Z",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicVisitorRequestForm />);

    const submit = screen.getByRole("button", { name: /Submit registration/i });
    expect(submit).toBeDisabled();

    fireEvent.change(screen.getByLabelText(/Main visitor name/i), { target: { value: "Nadia Visitor" } });
    fireEvent.change(screen.getByLabelText(/Main visitor NRIC number/i), { target: { value: "900101-14-1234" } });
    fireEvent.change(screen.getByLabelText(/Contact number/i), { target: { value: "0196776100" } });
    fireEvent.change(screen.getByLabelText(/^Company \/ organisation/i), { target: { value: "Test Company" } });
    fireEvent.change(screen.getByLabelText(/Company represented/i), { target: { value: "Partner Vendor" } });
    fireEvent.change(screen.getByLabelText(/Person or department to visit/i), { target: { value: "AI Projects Lab" } });
    fireEvent.change(screen.getByLabelText(/Vehicle plate/i), { target: { value: "wa 18 k" } });
    fireEvent.change(screen.getByLabelText(/Number of visitors/i), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Other visitor 1 name"), { target: { value: "Aminah Guest" } });
    fireEvent.change(screen.getByLabelText("Other visitor 2 name"), { target: { value: "Siti Guest" } });
    fireEvent.change(screen.getByLabelText(/Notes/i), { target: { value: "Waiting at guard house" } });

    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual(expect.objectContaining({
      name: "Nadia Visitor",
      phoneNumber: "0196776100",
      organisation: "Test Company",
      representingOrganisation: "Partner Vendor",
      requestedHostText: "AI Projects Lab",
      vehicleNumber: "WA 18 K",
      identityType: "nric",
      nric: "900101-14-1234",
      visitorCount: "3",
      otherVisitorNames: ["Aminah Guest", "Siti Guest"],
      remarks: "Waiting at guard house",
    }));
    expect(screen.getByText("Registration submitted")).toBeInTheDocument();
    expect(screen.getAllByText("WA 18 K").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Scan at gate before entering")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Save QR picture/i })).toBeInTheDocument();
  });

  it("sets purpose to Delivery when Courier is selected", () => {
    render(<PublicVisitorRequestForm />);

    fireEvent.change(screen.getByLabelText(/Visit type/i), { target: { value: "courier" } });

    expect(screen.getByLabelText(/^Purpose/i)).toHaveValue("delivery");
    expect(screen.getByLabelText(/^Purpose/i)).toBeEnabled();
  });

  it("does not require a requested host for Courier registrations", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      visitor: { id: "visit-1", name: "Courier Rider", vehicleNumber: "CR 100" },
      token: "signed-token",
      tokenExpiresAt: "2026-06-08T15:59:59.000Z",
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(<PublicVisitorRequestForm />);

    fireEvent.change(screen.getByLabelText(/Main visitor name/i), { target: { value: "Courier Rider" } });
    fireEvent.change(screen.getByLabelText(/Main visitor NRIC number/i), { target: { value: "900101-14-1234" } });
    fireEvent.change(screen.getByLabelText(/Contact number/i), { target: { value: "0196776100" } });
    fireEvent.change(screen.getByLabelText(/Visit type/i), { target: { value: "courier" } });
    fireEvent.change(screen.getByLabelText(/Vehicle plate/i), { target: { value: "cr 100" } });

    const submit = screen.getByRole("button", { name: /Submit registration/i });
    expect(submit).toBeEnabled();
    fireEvent.click(submit);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toEqual(expect.objectContaining({
      typeCode: "courier",
      purpose: "delivery",
      requestedHostText: "",
    }));
  });
});
