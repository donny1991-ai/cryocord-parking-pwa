import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSettingsEndpoint } from "@/app/api/admin/settings/route";
import { GET as getOptionsEndpoint, POST as createOptionEndpoint } from "@/app/api/admin/options/route";
import { GET as getUsersEndpoint, POST as createUserEndpoint } from "@/app/api/admin/users/route";
import { POST as createVehicleEndpoint } from "@/app/api/admin/vehicles/route";
import {
  DELETE as deleteVehicleEndpoint,
  PATCH as updateVehicleEndpoint,
} from "@/app/api/admin/vehicles/[id]/route";
import { PUT as flagVisitorEndpoint } from "@/app/api/admin/visitors/[id]/flag/route";
import { AppDataSource } from "@/db/data-source";
import { refreshParkingTestDatabase } from "@/test/refresh-database";
import { seedParkingUser } from "@/test/seeders/parking-user.seeder";
import { signTestSupabaseAccessToken } from "@/test/auth-token";

function request(
  path: string,
  token?: string,
  init: { method?: string; body?: BodyInit; headers?: Record<string, string> } = {},
) {
  return new NextRequest(`http://localhost${path}`, {
    ...init,
    headers: {
      ...(init.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  });
}

describe("admin API access control", () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  beforeEach(async () => {
    await refreshParkingTestDatabase(AppDataSource);
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it("rejects normal guards from admin-only APIs", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const visitorId = "00000000-0000-4000-8000-000000000001";
    const vehicleId = "00000000-0000-4000-8000-000000000002";

    const settingsResponse = await getSettingsEndpoint(request("/api/admin/settings", token));
    const optionsResponse = await getOptionsEndpoint(request("/api/admin/options", token));
    const usersResponse = await getUsersEndpoint(request("/api/admin/users", token));
    const vehicleResponse = await createVehicleEndpoint(
      request("/api/admin/vehicles", token, {
        method: "POST",
        body: JSON.stringify({ plate: "TST 100", ownerName: "Test Owner", ownerType: "staff" }),
      }),
    );
    const flagResponse = await flagVisitorEndpoint(
      request(`/api/admin/visitors/${visitorId}/flag`, token, {
        method: "PUT",
        body: JSON.stringify({ flagReason: "Should be rejected." }),
      }),
      { params: Promise.resolve({ id: visitorId }) },
    );
    const updateVehicleResponse = await updateVehicleEndpoint(
      request(`/api/admin/vehicles/${vehicleId}`, token, {
        method: "PATCH",
        body: JSON.stringify({ ownerName: "Should be rejected." }),
      }),
      { params: Promise.resolve({ id: vehicleId }) },
    );
    const deleteVehicleResponse = await deleteVehicleEndpoint(
      request(`/api/admin/vehicles/${vehicleId}`, token, { method: "DELETE" }),
      { params: Promise.resolve({ id: vehicleId }) },
    );

    for (const response of [settingsResponse, optionsResponse, usersResponse, vehicleResponse, flagResponse, updateVehicleResponse, deleteVehicleResponse]) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Parking access is not permitted for this account.",
      });
    }
  });

  it("allows admins to create parking users", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);

    const response = await createUserEndpoint(
      request("/api/admin/users", token, {
        method: "POST",
        body: JSON.stringify({
          name: "Khal",
          email: "khalili.kamal@cryocord.com.my",
          phone: "0111111111",
          role: "guard",
          active: true,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.user).toMatchObject({
      name: "Khal",
      email: "khalili.kamal@cryocord.com.my",
      phone: "0111111111",
      role: "guard",
      active: true,
    });
  });

  it("allows admins to manage visit type purpose rules", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);

    const getResponse = await getOptionsEndpoint(request("/api/admin/options", token));
    const getPayload = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getPayload.options.visitTypePurposeRules).toContainEqual(
      expect.objectContaining({ visitorTypeCode: "courier", purposeCode: "delivery" }),
    );

    const createResponse = await createOptionEndpoint(
      request("/api/admin/options", token, {
        method: "POST",
        body: JSON.stringify({
          kind: "purposeRule",
          visitorTypeCode: "vendor",
          purposeCode: "maintenance",
        }),
      }),
    );
    const createPayload = await createResponse.json();

    expect(createResponse.status).toBe(201);
    expect(createPayload.rule).toMatchObject({
      visitorTypeCode: "vendor",
      purposeCode: "maintenance",
    });
  });
});
