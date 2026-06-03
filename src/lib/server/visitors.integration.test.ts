import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as createVisitorEndpoint } from "@/app/api/visitors/route";
import { POST as scanVisitorEndpoint } from "@/app/api/visitors/scan/route";
import {
  DELETE as clearVisitorFlagEndpoint,
  PUT as flagVisitorEndpoint,
} from "@/app/api/admin/visitors/[id]/flag/route";
import { POST as cancelVisitorEndpoint } from "@/app/api/visitors/[id]/cancel/route";
import { AppDataSource } from "@/db/data-source";
import { VisitorScanEventSchema, VisitorSchema } from "@/db/entities";
import { createVisitorInputFactory } from "@/test/factories/visitor.factory";
import { refreshParkingTestDatabase } from "@/test/refresh-database";
import { seedParkingUser } from "@/test/seeders/parking-user.seeder";
import { seedVisitorTypes } from "@/test/seeders/visitor-type.seeder";
import { signTestSupabaseAccessToken } from "@/test/auth-token";
import { getPreRegistrationTokenExpiresAt, signVisitToken } from "@/lib/qr";
import { getParkingSnapshot, getVisitById } from "./parking-data";
import { createVisitorPass, getPublicVisitorPass, scanVisitorPass } from "./visitors";

function jsonRequest(path: string, body: unknown, token?: string, method = "POST") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

function emptyRequest(path: string, token?: string, method = "GET") {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

function futureVisitDate(daysFromNow = 30) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
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
    expect(issued.tokenExpiresAt).toEqual(expect.any(String));
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

  it("hides the public QR pass after checkout", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "guest" }));

    await expect(getPublicVisitorPass(issued.token)).resolves.toMatchObject({
      state: "active",
      status: "pending",
      token: issued.token,
      validUntil: issued.tokenExpiresAt,
    });

    await scanVisitorPass({ token: issued.token, action: "auto" });
    await expect(getPublicVisitorPass(issued.token)).resolves.toMatchObject({
      state: "active",
      status: "checked_in",
      token: issued.token,
    });

    await scanVisitorPass({ token: issued.token, action: "auto" });
    await expect(getPublicVisitorPass(issued.token)).resolves.toMatchObject({
      state: "inactive",
      title: "Pass already used",
    });
  });

  it("extends pre-registration token expiry to the selected visit date grace period", async () => {
    const visitDate = futureVisitDate();
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "guest", visitDate }));
    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });

    expect(visitor.visitDate).toBe(visitDate);
    expect(issued.tokenExpiresAt).toBe(getPreRegistrationTokenExpiresAt(visitDate).toISOString());
    await expect(getPublicVisitorPass(issued.token)).resolves.toMatchObject({
      state: "active",
      validUntil: issued.tokenExpiresAt,
    });

    const oldStyleToken = await signVisitToken(
      issued.visitor.id,
      visitor.qrTokenJti ?? undefined,
      new Date(visitor.createdAt),
      new Date(getPreRegistrationTokenExpiresAt(visitDate).getTime() + 24 * 60 * 60 * 1000),
    );

    await expect(getPublicVisitorPass(oldStyleToken)).resolves.toMatchObject({
      state: "active",
      validUntil: issued.tokenExpiresAt,
    });
  });

  it("loads pre-registered visit details with the selected visit date expiry", async () => {
    const visitDate = futureVisitDate();
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "PRE 7788",
        typeCode: "guest",
        visitDate,
      }),
    );

    await expect(getVisitById(issued.visitor.id)).resolves.toMatchObject({
      plate: "PRE 7788",
      status: "pending",
      visitDate,
      qrToken: expect.any(String),
      qrTokenExpiresAt: getPreRegistrationTokenExpiresAt(visitDate).toISOString(),
    });
  });

  it("cancels pending visitor passes and hides the public QR", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const visitDate = futureVisitDate();
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "CXL 500",
        typeCode: "guest",
        visitDate,
      }),
    );

    const response = await cancelVisitorEndpoint(
      emptyRequest(`/api/visitors/${issued.visitor.id}/cancel`, token, "POST"),
      { params: Promise.resolve({ id: issued.visitor.id }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      visitor: {
        id: issued.visitor.id,
        status: "cancelled",
      },
    });

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.status).toBe("cancelled");
    expect(visitor.qrTokenJti).toBeNull();

    await expect(getPublicVisitorPass(issued.token)).resolves.toMatchObject({
      state: "inactive",
      title: "Pass cancelled",
    });
    await expect(getVisitById(issued.visitor.id)).resolves.toMatchObject({
      plate: "CXL 500",
      status: "cancelled",
      visitDate,
    });
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

  it("can check in visitor passes immediately when the entry endpoint requests it", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        {
          ...createVisitorInputFactory({ typeCode: "guest" }),
          checkInOnCreate: true,
        },
        token,
      ),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.visitor.status).toBe("checked_in");
    expect(payload.visitor.checkedIn).toEqual(expect.any(String));

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: payload.visitor.id });
    expect(visitor.checkedInBy).toBe(guard.id);

    const checkInEvents = await AppDataSource.manager.count(VisitorScanEventSchema, {
      where: { visitorId: visitor.id, eventType: "check_in" },
    });
    expect(checkInEvents).toBe(1);
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

  it("supports pre-registered QR arrival check-in through the authenticated endpoint", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const visitDate = futureVisitDate();

    const issuedResponse = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        {
          ...createVisitorInputFactory({
            name: "Pre Registered Visitor",
            vehicleNumber: "PRE 4321",
            typeCode: "guest",
          }),
          visitDate,
          checkInOnCreate: false,
        },
        token,
      ),
    );

    expect(issuedResponse.status).toBe(201);
    const issued = await issuedResponse.json();
    expect(issued.visitor.status).toBe("pending");
    expect(issued.visitor.checkedIn).toBeNull();
    expect(issued.tokenExpiresAt).toBe(getPreRegistrationTokenExpiresAt(visitDate).toISOString());

    const arrivalResponse = await scanVisitorEndpoint(
      jsonRequest("/api/visitors/scan", { token: issued.token, action: "check_in" }, token),
    );

    expect(arrivalResponse.status).toBe(200);
    await expect(arrivalResponse.json()).resolves.toMatchObject({
      visitor: {
        vehicleNumber: "PRE 4321",
        status: "checked_in",
        checkedIn: expect.any(String),
      },
    });

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.checkedInBy).toBe(guard.id);
  });

  it("keeps pending and checked-out visits out of the live snapshot while retaining the QR token", async () => {
    const pending = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "PEND 100", typeCode: "guest" }),
    );
    const active = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "LIVE 200", typeCode: "vendor" }),
    );

    await scanVisitorPass({ token: active.token, action: "check_in", guardId: "guard-test" });

    let snapshot = await getParkingSnapshot();
    expect(snapshot.insideVisits.map((visit) => visit.plate)).toEqual(["LIVE 200"]);

    await scanVisitorPass({ token: active.token, action: "check_out", guardId: "guard-test" });

    snapshot = await getParkingSnapshot();
    expect(snapshot.insideVisits).toHaveLength(0);

    const pendingDetail = await getVisitById(pending.visitor.id);
    expect(pendingDetail).toMatchObject({
      plate: "PEND 100",
      status: "pending",
      qrToken: expect.any(String),
    });
  });

  it("allows admins to flag and clear checked-in visitors", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);
    const issued = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "FLAG 100", typeCode: "guest" }),
    );
    await scanVisitorPass({ token: issued.token, action: "check_in", guardId: admin.id });

    const flagResponse = await flagVisitorEndpoint(
      jsonRequest(
        `/api/admin/visitors/${issued.visitor.id}/flag`,
        { flagReason: "Escalated by security desk." },
        token,
        "PUT",
      ),
      { params: Promise.resolve({ id: issued.visitor.id }) },
    );

    expect(flagResponse.status).toBe(200);
    let visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.flagReason).toBe("Escalated by security desk.");
    expect(visitor.flaggedBy).toBe(admin.id);
    expect(visitor.flaggedAt).toEqual(expect.any(Date));
    await expect(getVisitById(issued.visitor.id)).resolves.toMatchObject({
      status: "flagged",
      flagReason: "Escalated by security desk.",
    });

    const clearResponse = await clearVisitorFlagEndpoint(
      emptyRequest(`/api/admin/visitors/${issued.visitor.id}/flag`, token, "DELETE"),
      { params: Promise.resolve({ id: issued.visitor.id }) },
    );

    expect(clearResponse.status).toBe(200);
    visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.flagReason).toBeNull();
    expect(visitor.flaggedBy).toBeNull();
    expect(visitor.flaggedAt).toBeNull();
  });
});
