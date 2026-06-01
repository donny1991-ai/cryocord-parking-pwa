import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { GET as getSettingsEndpoint } from "@/app/api/admin/settings/route";
import { GET as getUsersEndpoint } from "@/app/api/admin/users/route";
import { POST as createVehicleEndpoint } from "@/app/api/admin/vehicles/route";
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

    const settingsResponse = await getSettingsEndpoint(request("/api/admin/settings", token));
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

    for (const response of [settingsResponse, usersResponse, vehicleResponse, flagResponse]) {
      expect(response.status).toBe(403);
      await expect(response.json()).resolves.toEqual({
        error: "Parking access is not permitted for this account.",
      });
    }
  });
});
