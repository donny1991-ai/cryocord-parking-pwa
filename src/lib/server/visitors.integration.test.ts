import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as createVisitorEndpoint } from "@/app/api/visitors/route";
import { POST as scanVisitorEndpoint } from "@/app/api/visitors/scan/route";
import { AppDataSource } from "@/db/data-source";
import { VisitorScanEventSchema, VisitorSchema } from "@/db/entities";
import { createVisitorInputFactory } from "@/test/factories/visitor.factory";
import { refreshParkingTestDatabase } from "@/test/refresh-database";
import { seedParkingUser } from "@/test/seeders/parking-user.seeder";
import { seedVisitorTypes } from "@/test/seeders/visitor-type.seeder";
import { signTestSupabaseAccessToken } from "@/test/auth-token";
import { signVisitToken } from "@/lib/qr";
import { createVisitorPass, scanVisitorPass } from "./visitors";

function jsonRequest(path: string, body: unknown, token?: string) {
  return new NextRequest(`http://localhost${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("visitor pass database flow", () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
  });

  beforeEach(async () => {
    await refreshParkingTestDatabase(AppDataSource);
    await seedVisitorTypes(AppDataSource.manager);
  });

  afterAll(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });

  it("creates a pending visitor pass, checks in on first scan, and checks out on second scan", async () => {
    const input = createVisitorInputFactory({
      name: "  Aisyah Test Visitor  ",
      phoneNumber: "  +60 12-345 6789  ",
      vehicleNumber: "  wa 18-k  ",
      typeCode: "guest",
      remarks: "  integration test visitor  ",
    });

    const issued = await createVisitorPass(input);

    expect(issued.token).toBeTruthy();
    expect(issued.visitor).toMatchObject({
      name: "Aisyah Test Visitor",
      phoneNumber: "+60 12-345 6789",
      vehicleNumber: "WA 18-K",
      typeCode: "guest",
      status: "pending",
      checkedIn: null,
      checkedOut: null,
      remarks: "integration test visitor",
    });

    const checkedIn = await scanVisitorPass({
      token: issued.token,
      action: "auto",
      guardId: "guard-test",
    });

    expect(checkedIn.status).toBe("checked_in");
    expect(checkedIn.checkedIn).toEqual(expect.any(String));
    expect(checkedIn.checkedOut).toBeNull();

    const checkedOut = await scanVisitorPass({
      token: issued.token,
      action: "auto",
      guardId: "guard-test",
    });

    expect(checkedOut.status).toBe("checked_out");
    expect(checkedOut.checkedIn).toEqual(checkedIn.checkedIn);
    expect(checkedOut.checkedOut).toEqual(expect.any(String));

    const visitors = await AppDataSource.manager.count(VisitorSchema);
    const scanEvents = await AppDataSource.manager.count(VisitorScanEventSchema);
    expect(visitors).toBe(1);
    expect(scanEvents).toBe(3);
  });

  it("honours explicit check-in and check-out actions", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "staff" }));

    const checkedIn = await scanVisitorPass({ token: issued.token, action: "check_in" });
    expect(checkedIn.status).toBe("checked_in");

    const checkedOut = await scanVisitorPass({ token: issued.token, action: "check_out" });
    expect(checkedOut.status).toBe("checked_out");
  });

  it("rejects check-out before check-in without changing visitor state", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "vendor" }));

    await expect(scanVisitorPass({ token: issued.token, action: "check_out" })).rejects.toThrow(
      "Visitor must check in before check-out.",
    );

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.status).toBe("pending");
    expect(visitor.checkedIn).toBeNull();
    expect(visitor.checkedOut).toBeNull();
  });

  it("rejects duplicate check-in without adding a second check-in event", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "client" }));
    await scanVisitorPass({ token: issued.token, action: "check_in" });

    await expect(scanVisitorPass({ token: issued.token, action: "check_in" })).rejects.toThrow(
      "Visitor has already checked in.",
    );

    const checkInEvents = await AppDataSource.manager.count(VisitorScanEventSchema, {
      where: { eventType: "check_in" },
    });
    expect(checkInEvents).toBe(1);
  });

  it("rejects duplicate check-out after visitor has left", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "guest" }));
    await scanVisitorPass({ token: issued.token, action: "auto" });
    await scanVisitorPass({ token: issued.token, action: "auto" });

    await expect(scanVisitorPass({ token: issued.token, action: "auto" })).rejects.toThrow(
      "Visitor has already checked out.",
    );
  });

  it("rejects invalid visitor type codes", async () => {
    await expect(
      createVisitorPass(createVisitorInputFactory({ typeCode: "courier" as never })),
    ).rejects.toThrow();
  });

  it("rejects forged tokens with mismatched token id", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "vendor" }));
    const forged = await signVisitToken(issued.visitor.id, "wrong-token-id");

    await expect(scanVisitorPass({ token: forged, action: "auto" })).rejects.toThrow(
      "Visitor pass is not valid for this record.",
    );

    const rejectedEvents = await AppDataSource.manager.count(VisitorScanEventSchema, {
      where: { eventType: "scan_rejected" },
    });
    expect(rejectedEvents).toBe(1);
  });

  it("rejects unknown visitor ids and records rejected scan", async () => {
    const token = await signVisitToken("00000000-0000-4000-8000-000000000000", "missing-token");

    await expect(scanVisitorPass({ token, action: "auto" })).rejects.toThrow("Visitor pass not found.");

    const rejectedEvents = await AppDataSource.manager.count(VisitorScanEventSchema, {
      where: { eventType: "scan_rejected" },
    });
    expect(rejectedEvents).toBe(1);
  });

  it("rejects malformed QR tokens before touching the database", async () => {
    await expect(scanVisitorPass({ token: "not-a-jwt", action: "auto" })).rejects.toThrow();

    const scanEvents = await AppDataSource.manager.count(VisitorScanEventSchema);
    expect(scanEvents).toBe(0);
  });

  it("rejects malformed scan actions", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "guest" }));

    await expect(scanVisitorPass({ token: issued.token, action: "checkout" as never })).rejects.toThrow(
      "Invalid scan action.",
    );
  });

  it("enforces one active checked-in visitor per normalised vehicle number", async () => {
    const first = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "WA 18 K", typeCode: "guest" }),
    );
    const second = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "wa-18-k", typeCode: "vendor" }),
    );

    await scanVisitorPass({ token: first.token, action: "check_in" });

    await expect(scanVisitorPass({ token: second.token, action: "check_in" })).rejects.toThrow();

    const active = await AppDataSource.manager.count(VisitorSchema, {
      where: { status: "checked_in" },
    });
    expect(active).toBe(1);
  });

  it("allows the same vehicle to check in again after the previous visitor checks out", async () => {
    const first = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "JQ 900", typeCode: "guest" }),
    );
    const second = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "jq-900", typeCode: "vendor" }),
    );

    await scanVisitorPass({ token: first.token, action: "auto" });
    await scanVisitorPass({ token: first.token, action: "auto" });
    const checkedIn = await scanVisitorPass({ token: second.token, action: "auto" });

    expect(checkedIn.status).toBe("checked_in");
  });

  it("rejects unauthenticated visitor endpoint requests", async () => {
    const response = await createVisitorEndpoint(
      jsonRequest("/api/visitors", createVisitorInputFactory({ typeCode: "guest" })),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: "Authentication is required.",
    });
  });

  it("rejects authenticated users without an active parking profile", async () => {
    const user = await seedParkingUser(AppDataSource.manager, { active: false });
    const token = await signTestSupabaseAccessToken(user.id);

    const response = await createVisitorEndpoint(
      jsonRequest("/api/visitors", createVisitorInputFactory({ typeCode: "vendor" }), token),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      error: "Parking access is not enabled for this account.",
    });
  });

  it("creates visitor passes through the authenticated endpoint and ignores spoofed guard ids", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        {
          ...createVisitorInputFactory({ typeCode: "client" }),
          guardId: "spoofed-client-value",
        },
        token,
      ),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.token).toEqual(expect.any(String));
    expect(payload.visitor.status).toBe("pending");

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: payload.visitor.id });
    expect(visitor.createdBy).toBe(guard.id);
  });

  it("scans visitor passes through the authenticated endpoint and records the authenticated guard", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "supervisor" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const issuedResponse = await createVisitorEndpoint(
      jsonRequest("/api/visitors", createVisitorInputFactory({ typeCode: "guest" }), token),
    );
    const issued = await issuedResponse.json();

    const response = await scanVisitorEndpoint(
      jsonRequest(
        "/api/visitors/scan",
        {
          token: issued.token,
          action: "check_in",
          guardId: "spoofed-client-value",
        },
        token,
      ),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      visitor: {
        status: "checked_in",
      },
    });

    const checkInEvent = await AppDataSource.manager.findOneByOrFail(VisitorScanEventSchema, {
      eventType: "check_in",
    });
    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });

    expect(checkInEvent.guardId).toBe(guard.id);
    expect(visitor.checkedInBy).toBe(guard.id);
  });
});
