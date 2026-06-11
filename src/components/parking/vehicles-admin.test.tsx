import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { VehiclesAdmin } from "./vehicles-admin";

describe("VehiclesAdmin", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows vehicle owner type separately from blacklist status", () => {
    render(
      <VehiclesAdmin
        vehicles={[
          {
            id: "vehicle-1",
            plate: "VIP 1",
            plateNormalised: "VIP1",
            ownerName: "Datuk Seri A. Rahman",
            ownerType: "vip",
            blacklisted: false,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("VIP")).toBeInTheDocument();
    expect(screen.getByText("Allowed")).toBeInTheDocument();
    expect(screen.getByText("Not blacklisted; entry registration is allowed.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Block vehicle/i })).toBeVisible();
  });

  it("shows blacklisted status and unblock action for blocked vehicles", () => {
    render(
      <VehiclesAdmin
        vehicles={[
          {
            id: "vehicle-2",
            plate: "BLK 1",
            plateNormalised: "BLK1",
            ownerName: "Blocked Driver",
            blacklisted: true,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Blacklisted")).toBeInTheDocument();
    expect(screen.getByText("Entry registration is blocked for this plate.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Unblock vehicle/i })).toBeVisible();
  });

  it("stacks staff owner details and shows department only for staff vehicles", () => {
    render(
      <VehiclesAdmin
        vehicles={[
          {
            id: "vehicle-staff-lines",
            plate: "WPT 332",
            plateNormalised: "WPT332",
            ownerName: "Nurul Huda",
            ownerDepartment: "Sales Operations",
            ownerType: "staff",
            staffId: "EMP-0088",
            blacklisted: false,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
          {
            id: "vehicle-vendor-lines",
            plate: "VND 100",
            plateNormalised: "VND100",
            ownerName: "Vendor Owner",
            ownerDepartment: "Should Not Display",
            ownerType: "vendor",
            blacklisted: false,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
      />,
    );

    expect(screen.getByText("Nurul Huda")).toBeInTheDocument();
    expect(screen.getByText("EMP-0088")).toBeInTheDocument();
    expect(screen.getByText("Sales Operations")).toBeInTheDocument();
    expect(screen.queryByText(/Nurul Huda · EMP-0088/)).not.toBeInTheDocument();
    expect(screen.queryByText("Should Not Display")).not.toBeInTheDocument();
  });

  it("adds staff vehicles by selecting an HR directory employee", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      vehicle: {
        id: "vehicle-new-staff",
        plate: "WPT 332",
        plateNormalised: "WPT332",
        ownerName: "Nurul Huda",
        ownerEmail: "nurul.huda@cryocord.test",
        ownerType: "staff",
        staffId: "EMP-0088",
        blacklisted: false,
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T00:00:00.000Z",
      },
    }), { status: 201, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehiclesAdmin
        vehicles={[]}
        employees={[
          {
            staffId: "EMP-0088",
            name: "Nurul Huda",
            email: "nurul.huda@cryocord.test",
            phone: "+60128880000",
            department: "Sales Operations",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getAllByRole("button")[0]);
    fireEvent.change(screen.getByPlaceholderText("WA 18 K"), { target: { value: "wpt 332" } });
    const addButton = screen.getByRole("button", { name: /Add to registry/i });
    expect(addButton).toBeDisabled();

    fireEvent.change(screen.getByRole("combobox", { name: "Owner name" }), { target: { value: "nurul" } });
    fireEvent.click(await screen.findByText("Nurul Huda"));
    fireEvent.click(addButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      plate: "WPT 332",
      ownerType: "staff",
      staffId: "EMP-0088",
      blacklisted: false,
    });
    expect(body).not.toHaveProperty("ownerName");
  });

  it("edits known vehicle details inline", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      vehicle: {
        id: "vehicle-3",
        plate: "EDIT 200",
        plateNormalised: "EDIT200",
        ownerName: "Updated Owner",
        ownerContact: "+60122222222",
        ownerEmail: "owner@example.com",
        ownerType: "vendor",
        staffId: "EMP-0200",
        notes: "Updated note",
        blacklisted: true,
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T01:00:00.000Z",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehiclesAdmin
        vehicles={[
          {
            id: "vehicle-3",
            plate: "EDIT 100",
            plateNormalised: "EDIT100",
            ownerName: "Original Owner",
            blacklisted: false,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(await screen.findByDisplayValue("EDIT 100"), { target: { value: "edit 200" } });
    fireEvent.change(screen.getByLabelText("Owner name"), { target: { value: "Updated Owner" } });
    fireEvent.change(screen.getByLabelText("Owner contact"), { target: { value: "+60122222222" } });
    fireEvent.change(screen.getByLabelText("Owner email"), { target: { value: "owner@example.com" } });
    fireEvent.change(screen.getByLabelText("Owner type"), { target: { value: "vendor" } });
    fireEvent.change(screen.getByLabelText("Staff ID"), { target: { value: "emp-0200" } });
    fireEvent.change(screen.getByPlaceholderText("Optional notes"), { target: { value: "Updated note" } });
    fireEvent.click(screen.getByLabelText("Blacklist this vehicle and block new entry registrations"));
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(requestInit.method).toBe("PATCH");
    expect(JSON.parse(String(requestInit.body))).toEqual({
      plate: "EDIT 200",
      ownerName: "Updated Owner",
      ownerContact: "+60122222222",
      ownerEmail: "owner@example.com",
      ownerType: "vendor",
      staffId: "EMP-0200",
      notes: "Updated note",
      blacklisted: true,
    });
    await expect(screen.findByText("Vehicle details updated.")).resolves.toBeInTheDocument();
    expect(screen.getByText("EDIT 200")).toBeInTheDocument();
  });

  it("hides and clears staff id when the owner type is visitor", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      vehicle: {
        id: "vehicle-visitor",
        plate: "VIS 100",
        plateNormalised: "VIS100",
        ownerName: "Visitor Owner",
        ownerType: "visitor",
        blacklisted: false,
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T01:00:00.000Z",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehiclesAdmin
        vehicles={[
          {
            id: "vehicle-visitor",
            plate: "VIS 100",
            plateNormalised: "VIS100",
            ownerName: "Visitor Owner",
            ownerType: "vendor",
            staffId: "EMP-0999",
            blacklisted: false,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(await screen.findByLabelText("Staff ID")).toBeVisible();
    fireEvent.change(screen.getByLabelText("Owner type"), { target: { value: "visitor" } });

    expect(screen.queryByLabelText("Staff ID")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(requestInit.body))).toMatchObject({
      ownerType: "visitor",
      staffId: null,
    });
  });

  it("hides HR-backed owner fields when the owner type is staff", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      vehicle: {
        id: "vehicle-staff",
        plate: "WPT 332",
        plateNormalised: "WPT332",
        ownerName: "Nurul Huda",
        ownerType: "staff",
        staffId: "EMP-0088",
        blacklisted: false,
        createdAt: "2026-06-09T00:00:00.000Z",
        updatedAt: "2026-06-09T01:00:00.000Z",
      },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehiclesAdmin
        vehicles={[
          {
            id: "vehicle-staff",
            plate: "WPT 332",
            plateNormalised: "WPT332",
            ownerName: "Nurul Huda",
            ownerContact: "+60123450000",
            ownerEmail: "nurul@example.com",
            ownerType: "staff",
            staffId: "EMP-0088",
            blacklisted: false,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    expect(await screen.findByLabelText("Owner type")).toHaveValue("staff");
    expect(screen.queryByLabelText("Owner name")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Owner contact")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Owner email")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Staff ID")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(requestInit.body));
    expect(body).toMatchObject({
      plate: "WPT 332",
      ownerType: "staff",
    });
    expect(body).not.toHaveProperty("ownerName");
    expect(body).not.toHaveProperty("ownerContact");
    expect(body).not.toHaveProperty("ownerEmail");
    expect(body).not.toHaveProperty("staffId");
  });

  it("confirms before removing a known vehicle", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      vehicle: { id: "vehicle-4" },
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <VehiclesAdmin
        vehicles={[
          {
            id: "vehicle-4",
            plate: "DEL 100",
            plateNormalised: "DEL100",
            ownerName: "Delete Owner",
            blacklisted: false,
            createdAt: "2026-06-09T00:00:00.000Z",
            updatedAt: "2026-06-09T00:00:00.000Z",
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.getByText("Remove this vehicle from known vehicles?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Remove vehicle" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, requestInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/admin/vehicles/vehicle-4");
    expect(requestInit.method).toBe("DELETE");
    await expect(screen.findByText("DEL 100 removed from known vehicles. Visitor history is unchanged.")).resolves.toBeInTheDocument();
    expect(screen.queryByText("Delete Owner")).not.toBeInTheDocument();
  });
});
