import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { POST as createPublicVisitorRequestEndpoint } from "@/app/api/public/visitor-requests/route";
import { PATCH as reviewVisitorRequestEndpoint } from "@/app/api/visitor-requests/[id]/route";
import { POST as createVisitorEndpoint } from "@/app/api/visitors/route";
import { POST as scanVisitorEndpoint } from "@/app/api/visitors/scan/route";
import {
  DELETE as clearVisitorFlagEndpoint,
  PUT as flagVisitorEndpoint,
} from "@/app/api/admin/visitors/[id]/flag/route";
import { POST as createVehicleEndpoint } from "@/app/api/admin/vehicles/route";
import {
  DELETE as deleteVehicleEndpoint,
  PATCH as updateVehicleEndpoint,
} from "@/app/api/admin/vehicles/[id]/route";
import { POST as cancelVisitorEndpoint } from "@/app/api/visitors/[id]/cancel/route";
import { AppDataSource } from "@/db/data-source";
import {
  VehicleSchema,
  VisitorRequestSchema,
  VisitorScanEventSchema,
  VisitorSchema,
  VisitorVehicleSchema,
} from "@/db/entities";
import { createVisitorInputFactory } from "@/test/factories/visitor.factory";
import { refreshParkingTestDatabase } from "@/test/refresh-database";
import { seedHrHost } from "@/test/seeders/hr-host.seeder";
import { seedParkingUser } from "@/test/seeders/parking-user.seeder";
import { seedVisitorTypes } from "@/test/seeders/visitor-type.seeder";
import { signTestSupabaseAccessToken } from "@/test/auth-token";
import { getPreRegistrationTokenExpiresAt, signVisitToken } from "@/lib/qr";
import { getParkingSnapshot, getParkingVehicles, getVisitById } from "./parking-data";
import { getHostDirectory } from "./hosts";
import {
  createVisitorPass,
  getPublicVisitorPass,
  rejectVisitorPassScan,
  reviewVisitorPass,
  reviewVisitorPassForExit,
  scanVisitorPass,
} from "./visitors";

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

function tamperedHs256VisitToken(payload: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  return `${encode({ alg: "HS256", kid: "old" })}.${encode(payload)}.tampered`;
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
      organisation: "  CryoCord Test Partner  ",
      vehicleNumber: "  wa 18-k  ",
      typeCode: "visitor",
      visitTime: "09:30",
      visitorCount: 3,
      otherVisitorNames: ["Aminah Guest", "Siti Guest"],
      remarks: "  integration test visitor  ",
    });

    const issued = await createVisitorPass(input);

    expect(issued.token).toBeTruthy();
    expect(issued.tokenExpiresAt).toEqual(expect.any(String));
    expect(issued.visitor).toMatchObject({
      name: "Aisyah Test Visitor",
      phoneNumber: "+60 12-345 6789",
      organisation: "CryoCord Test Partner",
      vehicleNumber: "WA 18-K",
      typeCode: "visitor",
      status: "pending",
      checkedIn: null,
      checkedOut: null,
      visitTime: "09:30",
      visitorCount: 3,
      otherVisitorNames: ["Aminah Guest", "Siti Guest"],
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
    expect(checkedIn.otherVisitorNames).toEqual(["Aminah Guest", "Siti Guest"]);

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

  it("blocks visitor pass creation when the vehicle is blacklisted", async () => {
    const actor = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(actor.id);
    await AppDataSource.manager.save(VehicleSchema, {
      plate: "BLOCK 100",
      plateNormalised: "BLOCK100",
      notes: "Security incident under review.",
      blacklisted: true,
    });

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        createVisitorInputFactory({ vehicleNumber: "block-100", typeCode: "visitor" }),
        token,
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("Vehicle BLOCK 100 is blacklisted"),
    });
    await expect(AppDataSource.manager.count(VisitorSchema)).resolves.toBe(0);
  });

  it("rejects arrival check-in when a pending vehicle becomes blacklisted", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "LATE BLOCK", typeCode: "visitor" }),
    );
    await AppDataSource.manager.save(VehicleSchema, {
      plate: "LATE BLOCK",
      plateNormalised: "LATEBLOCK",
      notes: "Added to blacklist after pre-registration.",
      blacklisted: true,
    });

    const reviewed = await reviewVisitorPass({ token: issued.token, guardId: "guard-review" });
    expect(reviewed.vehicles).toContainEqual(expect.objectContaining({
      vehicleNumber: "LATE BLOCK",
      blacklisted: true,
      blacklistReason: "Added to blacklist after pre-registration.",
    }));

    await expect(
      scanVisitorPass({ token: issued.token, action: "check_in", guardId: "guard-arrival" }),
    ).rejects.toThrow("Vehicle LATE BLOCK is blacklisted");

    const rejectedEvent = await AppDataSource.manager.findOneByOrFail(VisitorScanEventSchema, {
      visitorId: issued.visitor.id,
      eventType: "scan_rejected",
    });
    expect(rejectedEvent.metadata).toMatchObject({
      reason: "blacklisted_vehicle",
      vehicleNumber: "LATE BLOCK",
    });
    await expect(getVisitById(issued.visitor.id)).resolves.toMatchObject({ status: "pending" });
  });

  it("stores additional vehicle plates on one visitor registration", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "MAIN 100",
        additionalVehicleNumbers: ["ALT 101", "main-100", "alt-101", "ALT 102"],
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    expect(issued.visitor.additionalVehicleNumbers).toEqual(["ALT 101", "ALT 102"]);

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.additionalVehicleNumbers).toEqual(["ALT 101", "ALT 102"]);

    await expect(getVisitById(issued.visitor.id)).resolves.toMatchObject({
      plate: "MAIN 100",
      additionalPlates: ["ALT 101", "ALT 102"],
    });
  });

  it("resolves host contact details from HR public users for guard confirmation", async () => {
    const host = await seedHrHost(AppDataSource.manager, {
      empNo: "CCSB0698",
      name: "Aina Host",
      department: "AI Projects Lab",
      phone: "0191112222",
      extension: "808",
    });
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "HOST 100",
        typeCode: "visitor",
        hostStaffId: host.staffId,
        hostDepartment: "",
      }),
    );

    await expect(getHostDirectory()).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          staffId: "CCSB0698",
          name: "Aina Host",
          department: "AI Projects Lab",
          phone: "0191112222",
          extension: "808",
        }),
      ]),
    );
    await expect(getVisitById(issued.visitor.id)).resolves.toMatchObject({
      hostStaffId: "CCSB0698",
      hostDepartment: "AI Projects Lab",
      host: {
        staffId: "CCSB0698",
        name: "Aina Host",
        department: "AI Projects Lab",
        phone: "0191112222",
        extension: "808",
      },
    });

    const reviewed = await reviewVisitorPass({ token: issued.token, guardId: "guard-host-review" });
    expect(reviewed).toMatchObject({
      hostStaffId: "CCSB0698",
      hostDepartment: "AI Projects Lab",
      host: {
        staffId: "CCSB0698",
        name: "Aina Host",
        department: "AI Projects Lab",
        phone: "0191112222",
        extension: "808",
      },
    });
  });

  it("tracks staggered check-in and check-out per vehicle under one registration", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "CAR A",
        additionalVehicleNumbers: ["CAR B", "CAR C"],
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    const carBIn = await scanVisitorPass({
      token: issued.token,
      action: "check_in",
      vehicleNumber: "CAR B",
      guardId: "guard-b-in",
    });
    expect(carBIn).toMatchObject({
      status: "checked_in",
      activeVehicleNumber: "CAR B",
      vehicles: [
        expect.objectContaining({ vehicleNumber: "CAR A", status: "pending" }),
        expect.objectContaining({ vehicleNumber: "CAR B", status: "checked_in", checkedInBy: "guard-b-in" }),
        expect.objectContaining({ vehicleNumber: "CAR C", status: "pending" }),
      ],
    });

    const carAIn = await scanVisitorPass({
      token: issued.token,
      action: "check_in",
      vehicleNumber: "CAR A",
      guardId: "guard-a-in",
    });
    expect(carAIn.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vehicleNumber: "CAR A", status: "checked_in", checkedInBy: "guard-a-in" }),
        expect.objectContaining({ vehicleNumber: "CAR B", status: "checked_in", checkedInBy: "guard-b-in" }),
        expect.objectContaining({ vehicleNumber: "CAR C", status: "pending" }),
      ]),
    );

    const carBOut = await scanVisitorPass({
      token: issued.token,
      action: "check_out",
      vehicleNumber: "CAR B",
      guardId: "guard-b-out",
    });
    expect(carBOut).toMatchObject({
      status: "checked_in",
      activeVehicleNumber: "CAR A",
    });
    expect(carBOut.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vehicleNumber: "CAR A", status: "checked_in" }),
        expect.objectContaining({ vehicleNumber: "CAR B", status: "checked_out", checkedOutBy: "guard-b-out" }),
        expect.objectContaining({ vehicleNumber: "CAR C", status: "pending" }),
      ]),
    );

    const partialSnapshot = await getParkingSnapshot();
    const partialLogRows = partialSnapshot.logVisits.filter((visit) => visit.id === issued.visitor.id);
    expect(partialLogRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          plate: "CAR A",
          status: "inside",
          registrationPlate: "CAR A",
          registrationVehicleRole: "primary",
        }),
        expect.objectContaining({
          plate: "CAR B",
          status: "exited",
          registrationPlate: "CAR A",
          registrationVehicleCount: 3,
          registrationVehicleRole: "linked",
        }),
        expect.objectContaining({
          plate: "CAR C",
          status: "pending",
          registrationPlate: "CAR A",
          registrationVehicleRole: "linked",
        }),
      ]),
    );

    const carAOut = await scanVisitorPass({
      token: issued.token,
      action: "check_out",
      vehicleNumber: "CAR A",
      guardId: "guard-a-out",
    });
    expect(carAOut).toMatchObject({
      status: "pending",
      checkedIn: null,
      checkedOut: null,
      activeVehicleNumber: null,
    });
    expect(carAOut.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vehicleNumber: "CAR A", status: "checked_out", checkedOutBy: "guard-a-out" }),
        expect.objectContaining({ vehicleNumber: "CAR B", status: "checked_out", checkedOutBy: "guard-b-out" }),
        expect.objectContaining({ vehicleNumber: "CAR C", status: "pending" }),
      ]),
    );

    const rows = await AppDataSource.manager.find(VisitorVehicleSchema, {
      where: { visitorId: issued.visitor.id },
    });
    expect(rows).toHaveLength(3);

    await expect(getVisitById(issued.visitor.id)).resolves.toMatchObject({
      plate: "CAR A",
      status: "partially_arrived",
      vehicles: expect.arrayContaining([
        expect.objectContaining({ plate: "CAR A", status: "checked_out" }),
        expect.objectContaining({ plate: "CAR B", status: "checked_out" }),
        expect.objectContaining({ plate: "CAR C", status: "pending" }),
      ]),
    });

    const snapshot = await getParkingSnapshot();
    const registrationLogRows = snapshot.logVisits.filter((visit) => visit.id === issued.visitor.id);
    expect(registrationLogRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          plate: "CAR A",
          status: "exited",
          registrationPlate: "CAR A",
          registrationVehicleCount: 3,
          registrationVehicleRole: "primary",
        }),
        expect.objectContaining({
          plate: "CAR B",
          status: "exited",
          registrationPlate: "CAR A",
          registrationVehicleCount: 3,
          registrationVehicleRole: "linked",
        }),
        expect.objectContaining({
          plate: "CAR C",
          status: "pending",
          registrationPlate: "CAR A",
          registrationVehicleCount: 3,
          registrationVehicleRole: "linked",
        }),
      ]),
    );
  });

  it("displays expired pending registrations and vehicles as no-show without changing database status", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "NO SHOW A",
        additionalVehicleNumbers: ["NO SHOW B"],
        typeCode: "visitor",
      }),
    );
    await AppDataSource.manager.query(
      `
        UPDATE "parking"."visitors"
        SET "created_at" = now() - interval '2 days'
        WHERE "id" = $1
      `,
      [issued.visitor.id],
    );

    const visit = await getVisitById(issued.visitor.id);
    expect(visit).toMatchObject({
      status: "no_show",
      vehicles: expect.arrayContaining([
        expect.objectContaining({ plate: "NO SHOW A", status: "pending", displayStatus: "no_show" }),
        expect.objectContaining({ plate: "NO SHOW B", status: "pending", displayStatus: "no_show" }),
      ]),
    });

    const saved = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(saved.status).toBe("pending");
  });

  it("allows the same QR to be reviewed again while linked vehicles are still pending", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "SEQ A",
        additionalVehicleNumbers: ["SEQ B", "SEQ C"],
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    await scanVisitorPass({
      token: issued.token,
      action: "check_in",
      vehicleNumber: "SEQ B",
      guardId: "guard-b-in",
    });

    const reviewed = await reviewVisitorPass({ token: issued.token, guardId: "guard-review-a" });

    expect(reviewed).toMatchObject({
      id: issued.visitor.id,
      status: "checked_in",
      activeVehicleNumber: "SEQ B",
      vehicles: [
        expect.objectContaining({ vehicleNumber: "SEQ A", status: "pending" }),
        expect.objectContaining({ vehicleNumber: "SEQ B", status: "checked_in" }),
        expect.objectContaining({ vehicleNumber: "SEQ C", status: "pending" }),
      ],
    });

    const checkedInA = await scanVisitorPass({
      token: issued.token,
      action: "check_in",
      vehicleNumber: "SEQ A",
      guardId: "guard-a-in",
    });
    expect(checkedInA.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vehicleNumber: "SEQ A", status: "checked_in" }),
        expect.objectContaining({ vehicleNumber: "SEQ B", status: "checked_in" }),
        expect.objectContaining({ vehicleNumber: "SEQ C", status: "pending" }),
      ]),
    );
  });

  it("reviews a QR for exit and returns active linked vehicles before checkout", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "OUT A",
        additionalVehicleNumbers: ["OUT B", "OUT C"],
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    await scanVisitorPass({
      token: issued.token,
      action: "check_in",
      vehicleNumber: "OUT A",
      guardId: "guard-a-in",
    });
    await scanVisitorPass({
      token: issued.token,
      action: "check_in",
      vehicleNumber: "OUT B",
      guardId: "guard-b-in",
    });

    const reviewed = await reviewVisitorPassForExit({ token: issued.token, guardId: "guard-exit-review" });
    expect(reviewed.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vehicleNumber: "OUT A", status: "checked_in" }),
        expect.objectContaining({ vehicleNumber: "OUT B", status: "checked_in" }),
        expect.objectContaining({ vehicleNumber: "OUT C", status: "pending" }),
      ]),
    );

    await expect(scanVisitorPass({ token: issued.token, action: "check_out" })).rejects.toThrow(
      "Select a vehicle to check out.",
    );

    const checkedOut = await scanVisitorPass({
      token: issued.token,
      action: "check_out",
      vehicleNumber: "OUT B",
      guardId: "guard-b-out",
    });
    expect(checkedOut.vehicles).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ vehicleNumber: "OUT A", status: "checked_in" }),
        expect.objectContaining({ vehicleNumber: "OUT B", status: "checked_out", checkedOutBy: "guard-b-out" }),
        expect.objectContaining({ vehicleNumber: "OUT C", status: "pending" }),
      ]),
    );
  });

  it("reviews a single active vehicle QR for exit", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ vehicleNumber: "SOLO OUT", typeCode: "visitor" }));

    await scanVisitorPass({ token: issued.token, action: "check_in", guardId: "guard-in" });

    const reviewed = await reviewVisitorPassForExit({ token: issued.token, guardId: "guard-exit-review" });
    expect(reviewed).toMatchObject({
      vehicleNumber: "SOLO OUT",
      status: "checked_in",
      vehicles: [expect.objectContaining({ vehicleNumber: "SOLO OUT", status: "checked_in" })],
    });

    const checkedOut = await scanVisitorPass({ token: issued.token, action: "check_out", guardId: "guard-out" });
    expect(checkedOut).toMatchObject({
      vehicleNumber: "SOLO OUT",
      status: "checked_out",
      checkedOut: expect.any(String),
    });
  });

  it("syncs HR-provided additional plates into vehicle decisions during QR review", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "HR MAIN",
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );
    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    visitor.additionalVehicleNumbers = ["HR 2", "HR 3"];
    await AppDataSource.manager.save(VisitorSchema, visitor);

    const reviewed = await reviewVisitorPass({ token: issued.token, guardId: "guard-review" });

    expect(reviewed).toMatchObject({
      vehicleNumber: "HR MAIN",
      additionalVehicleNumbers: ["HR 2", "HR 3"],
      vehicles: [
        expect.objectContaining({ vehicleNumber: "HR MAIN", status: "pending", isPrimary: true }),
        expect.objectContaining({ vehicleNumber: "HR 2", status: "pending", isPrimary: false }),
        expect.objectContaining({ vehicleNumber: "HR 3", status: "pending", isPrimary: false }),
      ],
    });
  });

  it("rejects one vehicle arrival while keeping linked vehicles available", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "RJ A",
        additionalVehicleNumbers: ["RJ B"],
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    const rejected = await rejectVisitorPassScan({
      token: issued.token,
      vehicleNumber: "RJ B",
      guardId: "guard-reject",
      reason: "Vehicle did not match security instruction.",
    });

    expect(rejected).toMatchObject({
      status: "pending",
      vehicles: [
        expect.objectContaining({ vehicleNumber: "RJ A", status: "pending" }),
        expect.objectContaining({ vehicleNumber: "RJ B", status: "rejected" }),
      ],
    });

    const approved = await scanVisitorPass({
      token: issued.token,
      action: "check_in",
      vehicleNumber: "RJ A",
      guardId: "guard-approve",
    });
    expect(approved).toMatchObject({
      status: "checked_in",
      activeVehicleNumber: "RJ A",
      vehicles: [
        expect.objectContaining({ vehicleNumber: "RJ A", status: "checked_in" }),
        expect.objectContaining({ vehicleNumber: "RJ B", status: "rejected" }),
      ],
    });

    const rejectEvent = await AppDataSource.manager.findOneByOrFail(VisitorScanEventSchema, {
      visitorId: issued.visitor.id,
      eventType: "scan_rejected",
    });
    expect(rejectEvent.metadata).toMatchObject({
      reason: "manual_rejection",
      vehicleNumber: "RJ B",
    });
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
      "Vehicle must check in before check-out.",
    );

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.status).toBe("pending");
    expect(visitor.checkedIn).toBeNull();
    expect(visitor.checkedOut).toBeNull();
  });

  it("rejects duplicate check-in without adding a second check-in event", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "patient" }));
    await scanVisitorPass({ token: issued.token, action: "check_in" });

    await expect(scanVisitorPass({ token: issued.token, action: "check_in" })).rejects.toThrow(
      "Vehicle has already checked in.",
    );

    const checkInEvents = await AppDataSource.manager.count(VisitorScanEventSchema, {
      where: { eventType: "check_in" },
    });
    expect(checkInEvents).toBe(1);
  });

  it("rejects duplicate check-out after visitor has left", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "visitor" }));
    await scanVisitorPass({ token: issued.token, action: "auto" });
    await scanVisitorPass({ token: issued.token, action: "auto" });

    await expect(scanVisitorPass({ token: issued.token, action: "auto" })).rejects.toThrow(
      "Vehicle has already checked out.",
    );
  });

  it("hides the public QR pass after checkout", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "visitor" }));

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
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "visitor", visitDate }));
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

  it("uses the database visit date policy instead of a stale JWT exp for pending pre-registrations", async () => {
    const visitDate = futureVisitDate();
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "POLICY 100",
        typeCode: "visitor",
        visitDate,
      }),
    );
    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    const staleToken = await signVisitToken(
      issued.visitor.id,
      visitor.qrTokenJti ?? undefined,
      new Date("2026-06-03T00:00:00.000Z"),
      new Date("2026-06-03T01:00:00.000Z"),
    );

    await expect(getPublicVisitorPass(staleToken)).resolves.toMatchObject({
      state: "active",
      status: "pending",
      token: staleToken,
      validUntil: getPreRegistrationTokenExpiresAt(visitDate).toISOString(),
    });

    const checkedIn = await scanVisitorPass({ token: staleToken, action: "check_in", guardId: "guard-test" });
    expect(checkedIn).toMatchObject({
      id: issued.visitor.id,
      status: "checked_in",
      checkedIn: expect.any(String),
    });
  });

  it("keeps pending pre-registration passes usable after a signing key change when the DB token id matches", async () => {
    const originalKey = process.env.PARKING_QR_SIGNING_KEY;
    const visitDate = futureVisitDate();
    process.env.PARKING_QR_SIGNING_KEY = "before-docker-rebuild-test-key";
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "KEY 100",
        typeCode: "visitor",
        visitDate,
      }),
    );
    process.env.PARKING_QR_SIGNING_KEY = "after-docker-rebuild-test-key";

    try {
      await expect(getPublicVisitorPass(issued.token)).resolves.toMatchObject({
        state: "active",
        status: "pending",
        token: issued.token,
        validUntil: getPreRegistrationTokenExpiresAt(visitDate).toISOString(),
      });

      const checkedIn = await scanVisitorPass({ token: issued.token, action: "check_in", guardId: "guard-test" });
      expect(checkedIn).toMatchObject({
        id: issued.visitor.id,
        status: "checked_in",
        checkedIn: expect.any(String),
      });
    } finally {
      if (originalKey === undefined) {
        delete process.env.PARKING_QR_SIGNING_KEY;
      } else {
        process.env.PARKING_QR_SIGNING_KEY = originalKey;
      }
    }
  });

  it("loads pre-registered visit details with the selected visit date expiry", async () => {
    const visitDate = futureVisitDate();
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "PRE 7788",
        typeCode: "visitor",
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
        typeCode: "visitor",
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
      createVisitorPass(createVisitorInputFactory({ typeCode: "unknown" as never })),
    ).rejects.toThrow();
  });

  it("requires remarks when visit type or purpose is Other", async () => {
    await expect(
      createVisitorPass(
        createVisitorInputFactory({
          typeCode: "other",
          purpose: "meeting",
          remarks: "",
        }),
      ),
    ).rejects.toThrow("Remarks are required when visit type or purpose is Other.");

    await expect(
      createVisitorPass(
        createVisitorInputFactory({
          typeCode: "visitor",
          purpose: "other",
          remarks: "",
        }),
      ),
    ).rejects.toThrow("Remarks are required when visit type or purpose is Other.");
  });

  it("requires a valid Malaysian NRIC when NRIC identity is selected", async () => {
    await expect(
      createVisitorPass(
        createVisitorInputFactory({
          identityType: "nric",
          nric: "990230-14-1234",
        }),
      ),
    ).rejects.toThrow("NRIC must be a valid Malaysian NRIC number.");

    await expect(
      createVisitorPass(
        createVisitorInputFactory({
          identityType: "nric",
          nric: "900101-17-1234",
        }),
      ),
    ).rejects.toThrow("NRIC must be a valid Malaysian NRIC number.");
  });

  it("requires either NRIC or passport when creating a visitor pass", async () => {
    await expect(
      createVisitorPass(
        createVisitorInputFactory({
          identityType: undefined,
          nric: null,
          passportNumber: null,
        }),
      ),
    ).rejects.toThrow("Identity document is required.");
  });

  it("allows passport identity when NRIC is not provided", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        identityType: "passport",
        nric: null,
        passportNumber: "a1234567",
      }),
    );

    expect(issued.visitor).toMatchObject({
      identityType: "passport",
      nric: null,
      passportNumber: "A1234567",
    });
  });

  it("rejects all-letter passport numbers", async () => {
    await expect(
      createVisitorPass(
        createVisitorInputFactory({
          identityType: "passport",
          nric: null,
          passportNumber: "ASDQWEAASD",
        }),
      ),
    ).rejects.toThrow("Passport number must contain 5 to 20 letters or digits and include at least one number.");
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

  it("does not trust tampered token expiry when the DB token id matches", async () => {
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "vendor" }));
    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    await AppDataSource.manager.query(
      `UPDATE "parking"."visitors" SET "created_at" = $1 WHERE "id" = $2`,
      [new Date(Date.now() - 3 * 24 * 60 * 60 * 1000), issued.visitor.id],
    );
    const forged = tamperedHs256VisitToken({
      visitId: issued.visitor.id,
      jti: visitor.qrTokenJti,
      iss: "cryocord-parking",
      exp: Math.floor(Date.now() / 1000) + 60 * 60,
    });

    await expect(scanVisitorPass({ token: forged, action: "auto" })).rejects.toThrow("Visitor pass has expired.");

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
    const issued = await createVisitorPass(createVisitorInputFactory({ typeCode: "visitor" }));

    await expect(scanVisitorPass({ token: issued.token, action: "checkout" as never })).rejects.toThrow(
      "Invalid scan action.",
    );
  });

  it("enforces one active checked-in visitor per normalised vehicle number", async () => {
    const first = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "WA 18 K", typeCode: "visitor" }),
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

  it("returns a conflict when immediate entry uses a vehicle already checked in", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const active = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "HEHE", typeCode: "visitor" }),
    );
    await scanVisitorPass({ token: active.token, action: "check_in", guardId: guard.id });

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        {
          ...createVisitorInputFactory({
            name: "Visitor1",
            phoneNumber: "0196776100",
            identityType: "nric",
            nric: "900101141234",
            vehicleNumber: "HEHE",
            typeCode: "visitor",
            purpose: "meeting",
            visitorCount: "3",
            remarks: "hahahiuhihtokitoki",
          }),
          otherVisitorNames: ["Visitor2", "Visitor3"],
          hostStaffId: "CCSB0698",
          hostDepartment: "AI Projects Lab",
          checkInOnCreate: true,
        },
        token,
      ),
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Vehicle is already checked in under another active visit.",
    });
  });

  it("allows the same vehicle to check in again after the previous visitor checks out", async () => {
    const first = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "JQ 900", typeCode: "visitor" }),
    );
    const second = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "jq-900", typeCode: "vendor" }),
    );

    await scanVisitorPass({ token: first.token, action: "auto" });
    await scanVisitorPass({ token: first.token, action: "auto" });
    const checkedIn = await scanVisitorPass({ token: second.token, action: "auto" });

    expect(checkedIn.status).toBe("checked_in");
  });

  it("accepts public wall-QR visitor requests without exposing HR host lookup", async () => {
    const response = await createPublicVisitorRequestEndpoint(
      jsonRequest("/api/public/visitor-requests", {
        name: "Wall QR Visitor",
        phoneNumber: "0196776100",
        organisation: "Public Company",
        identityType: "nric",
        nric: "900101-14-1234",
        vehicleNumber: "WALL 100",
        purpose: "meeting",
        visitorCount: "3",
        otherVisitorNames: ["Second Visitor", "Third Visitor"],
        requestedHostText: "AI Projects Lab",
        remarks: "Submitted from lobby wall QR",
      }),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.request).toMatchObject({
      name: "Wall QR Visitor",
      vehicleNumber: "WALL 100",
      requestedHostText: "AI Projects Lab",
      status: "submitted",
      otherVisitorNames: ["Second Visitor", "Third Visitor"],
    });

    await expect(AppDataSource.manager.count(VisitorSchema)).resolves.toBe(0);
    await expect(AppDataSource.manager.findOneByOrFail(VisitorRequestSchema, { id: payload.request.id })).resolves.toMatchObject({
      vehicleNumber: "WALL 100",
      status: "submitted",
      requestedHostText: "AI Projects Lab",
    });
  });

  it("converts a public visitor request only after a guard assigns an HR host", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const host = await seedHrHost(AppDataSource.manager, {
      id: 690,
      empNo: "CCSB0690",
      name: "Request Host",
      department: "AI Projects Lab",
      email: "request.host@cryocord.test",
      phone: "+60126900000",
    });
    const createResponse = await createPublicVisitorRequestEndpoint(
      jsonRequest("/api/public/visitor-requests", {
        name: "Convert Me",
        phoneNumber: "0196776111",
        identityType: "passport",
        passportNumber: "A1234567",
        vehicleNumber: "REQ 200",
        purpose: "meeting",
        requestedHostText: "Dr. Request",
      }),
    );
    const created = await createResponse.json();

    const missingHostResponse = await reviewVisitorRequestEndpoint(
      jsonRequest(`/api/visitor-requests/${created.request.id}`, { hostStaffId: "" }, token, "PATCH"),
      { params: Promise.resolve({ id: created.request.id }) },
    );
    expect(missingHostResponse.status).toBe(400);
    await expect(missingHostResponse.json()).resolves.toMatchObject({
      error: "Host must be selected from the HR directory.",
    });

    const convertResponse = await reviewVisitorRequestEndpoint(
      jsonRequest(`/api/visitor-requests/${created.request.id}`, { hostStaffId: host.staffId }, token, "PATCH"),
      { params: Promise.resolve({ id: created.request.id }) },
    );

    expect(convertResponse.status).toBe(200);
    const payload = await convertResponse.json();
    expect(payload.request).toMatchObject({
      id: created.request.id,
      status: "converted",
      convertedVisitorId: payload.issued.visitor.id,
      reviewedBy: guard.id,
    });
    expect(payload.issued.visitor).toMatchObject({
      name: "Convert Me",
      vehicleNumber: "REQ 200",
      status: "checked_in",
      hostStaffId: host.staffId,
      hostDepartment: host.department,
    });

    const savedRequest = await AppDataSource.manager.findOneByOrFail(VisitorRequestSchema, { id: created.request.id });
    expect(savedRequest.status).toBe("converted");
    expect(savedRequest.convertedVisitorId).toBe(payload.issued.visitor.id);
  });

  it("rejects unauthenticated visitor endpoint requests", async () => {
    const response = await createVisitorEndpoint(
      jsonRequest("/api/visitors", createVisitorInputFactory({ typeCode: "visitor" })),
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

  it("requires a host on authenticated visitor endpoint requests", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        createVisitorInputFactory({ typeCode: "visitor", hostStaffId: "", hostDepartment: "" }),
        token,
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Host is required.",
    });
  });

  it("creates visitor passes through the authenticated endpoint and ignores spoofed guard ids", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        {
          ...createVisitorInputFactory({ typeCode: "patient" }),
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

  it("creates a pre-registered Other visitor through the authenticated endpoint when remarks are provided", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const visitDate = futureVisitDate();

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        {
          name: "Visitor11",
          phoneNumber: "0196776100",
          identityType: "nric",
          nric: "900101-14-1234",
          vehicleNumber: "TEZ 1234",
          typeCode: "other",
          purpose: "sample_delivery",
          visitDate,
          visitTime: "13:45",
          visitorCount: 6,
          remarks: "Testing other remarks",
          hostStaffId: "CCSB0698",
          hostDepartment: "AI Projects Lab",
          checkInOnCreate: false,
        },
        token,
      ),
    );

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload).toMatchObject({
      token: expect.any(String),
      visitor: {
        name: "Visitor11",
        phoneNumber: "0196776100",
        identityType: "nric",
        nric: "900101-14-1234",
        passportNumber: null,
        vehicleNumber: "TEZ 1234",
        typeCode: "other",
        purpose: "sample_delivery",
        visitDate,
        visitTime: "13:45",
        visitorCount: 6,
        remarks: "Testing other remarks",
        status: "pending",
        checkedIn: null,
      },
    });
  });

  it("rejects invalid purpose values on the authenticated visitor endpoint", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        {
          ...createVisitorInputFactory({ typeCode: "visitor" }),
          purpose: "not_a_real_purpose",
        },
        token,
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid purpose.",
    });
  });

  it("can check in visitor passes immediately when the entry endpoint requests it", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);

    const response = await createVisitorEndpoint(
      jsonRequest(
        "/api/visitors",
        {
          ...createVisitorInputFactory({ typeCode: "visitor" }),
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
      jsonRequest("/api/visitors", createVisitorInputFactory({ typeCode: "visitor" }), token),
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
            additionalVehicleNumbers: ["PRE 4322"],
            typeCode: "visitor",
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
        additionalVehicleNumbers: ["PRE 4322"],
        status: "checked_in",
        checkedIn: expect.any(String),
      },
    });

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.checkedInBy).toBe(guard.id);
  });

  it("reviews a pre-registered QR without checking in until the guard approves", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        name: "Manual Verify Visitor",
        vehicleNumber: "REV 4321",
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    const reviewed = await reviewVisitorPass({ token: issued.token, guardId: "guard-review" });

    expect(reviewed).toMatchObject({
      id: issued.visitor.id,
      vehicleNumber: "REV 4321",
      status: "pending",
      checkedIn: null,
    });

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.status).toBe("pending");
    expect(visitor.checkedIn).toBeNull();

    const reviewedEvents = await AppDataSource.manager.count(VisitorScanEventSchema, {
      where: { visitorId: visitor.id, eventType: "scan_reviewed" },
    });
    const checkInEvents = await AppDataSource.manager.count(VisitorScanEventSchema, {
      where: { visitorId: visitor.id, eventType: "check_in" },
    });
    expect(reviewedEvents).toBe(1);
    expect(checkInEvents).toBe(0);
  });

  it("approves arrival with guard-edited details and records the edit audit event", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        name: "Typo Name",
        phoneNumber: "+60 11 111 1111",
        vehicleNumber: "TYPO 100",
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    const reviewResponse = await scanVisitorEndpoint(
      jsonRequest("/api/visitors/scan", { token: issued.token, action: "review" }, token),
    );
    expect(reviewResponse.status).toBe(200);
    await expect(reviewResponse.json()).resolves.toMatchObject({
      visitor: {
        status: "pending",
        vehicleNumber: "TYPO 100",
      },
    });

    const approveResponse = await scanVisitorEndpoint(
      jsonRequest(
        "/api/visitors/scan",
        {
          token: issued.token,
          action: "check_in",
          visitor: {
            name: "Corrected Name",
            phoneNumber: "+60 12 222 2222",
            organisation: "Corrected Sdn Bhd",
            identityType: "nric",
            nric: "900101-14-2222",
            passportNumber: null,
            vehicleNumber: "OK 200",
            additionalVehicleNumbers: ["OK 201", "TYPO 100"],
            typeCode: "vendor",
            purpose: "delivery",
            remarks: "Plate corrected at gate.",
          },
        },
        token,
      ),
    );

    expect(approveResponse.status).toBe(200);
    await expect(approveResponse.json()).resolves.toMatchObject({
      visitor: {
        name: "Corrected Name",
        phoneNumber: "+60 12 222 2222",
        organisation: "Corrected Sdn Bhd",
        vehicleNumber: "OK 200",
        additionalVehicleNumbers: ["OK 201", "TYPO 100"],
        typeCode: "vendor",
        purpose: "delivery",
        remarks: "Plate corrected at gate.",
        status: "checked_in",
        checkedIn: expect.any(String),
      },
    });

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor).toMatchObject({
      name: "Corrected Name",
      phoneNumber: "+60 12 222 2222",
      organisation: "Corrected Sdn Bhd",
      identityType: "nric",
      nric: "900101-14-2222",
      passportNumber: null,
      vehicleNumber: "OK 200",
      vehicleNumberNormalised: "OK200",
      additionalVehicleNumbers: ["OK 201", "TYPO 100"],
      status: "checked_in",
      checkedInBy: guard.id,
    });

    const detailsEvent = await AppDataSource.manager.findOneByOrFail(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "details_updated",
    });
    expect(detailsEvent.guardId).toBe(guard.id);
    expect(detailsEvent.metadata).toMatchObject({
      reason: "arrival_manual_verification",
      changes: {
        name: { from: "Typo Name", to: "Corrected Name" },
        organisation: { from: expect.any(String), to: "Corrected Sdn Bhd" },
        nric: { from: expect.any(String), to: "900101-14-2222" },
        vehicleNumber: { from: "TYPO 100", to: "OK 200" },
        additionalVehicleNumbers: { from: null, to: "OK 201, TYPO 100" },
        typeCode: { from: "visitor", to: "vendor" },
      },
      identityDocument: {
        changedBy: guard.id,
        changedAt: expect.any(String),
        changes: {
          nric: { from: expect.any(String), to: "900101-14-2222" },
        },
      },
    });

    const checkInEvents = await AppDataSource.manager.count(VisitorScanEventSchema, {
      where: { visitorId: visitor.id, eventType: "check_in" },
    });
    expect(checkInEvents).toBe(1);
  });

  it("rejects invalid purpose values during guard-edited approval", async () => {
    const guard = await seedParkingUser(AppDataSource.manager, { role: "guard" });
    const token = await signTestSupabaseAccessToken(guard.id);
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "TYPO 300",
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    const response = await scanVisitorEndpoint(
      jsonRequest(
        "/api/visitors/scan",
        {
          token: issued.token,
          action: "check_in",
          visitor: {
            purpose: "not_a_real_purpose",
          },
        },
        token,
      ),
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: "Invalid purpose.",
    });
  });

  it("records manual arrival rejections without changing pending visitor state", async () => {
    const issued = await createVisitorPass(
      createVisitorInputFactory({
        vehicleNumber: "NOPE 500",
        typeCode: "visitor",
        visitDate: futureVisitDate(),
      }),
    );

    const rejected = await rejectVisitorPassScan({
      token: issued.token,
      guardId: "guard-reject",
      reason: "Plate number did not match the vehicle.",
    });

    expect(rejected).toMatchObject({
      id: issued.visitor.id,
      status: "pending",
      checkedIn: null,
    });

    const visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.status).toBe("pending");
    expect(visitor.checkedIn).toBeNull();

    const rejectEvent = await AppDataSource.manager.findOneByOrFail(VisitorScanEventSchema, {
      visitorId: visitor.id,
      eventType: "scan_rejected",
    });
    expect(rejectEvent.guardId).toBe("guard-reject");
    expect(rejectEvent.metadata).toMatchObject({
      reason: "manual_rejection",
      manualReason: "Plate number did not match the vehicle.",
    });
  });

  it("keeps pending and checked-out visits out of the live snapshot while retaining the QR token", async () => {
    const pending = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "PEND 100", typeCode: "visitor" }),
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

  it("allows admins to edit and remove known vehicle registry records", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);
    const vehicle = await AppDataSource.manager.save(VehicleSchema, {
      plate: "REG 100",
      plateNormalised: "REG100",
      ownerName: "Original Owner",
      ownerType: "visitor",
      blacklisted: false,
    });

    const updateResponse = await updateVehicleEndpoint(
      jsonRequest(
        `/api/admin/vehicles/${vehicle.id}`,
        {
          plate: "REG 200",
          ownerName: "Updated Owner",
          ownerContact: "+60123450000",
          ownerEmail: "updated@example.com",
          ownerType: "vendor",
          staffId: "EMP-0200",
          notes: "Registry updated.",
          blacklisted: true,
        },
        token,
        "PATCH",
      ),
      { params: Promise.resolve({ id: vehicle.id }) },
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      vehicle: {
        id: vehicle.id,
        plate: "REG 200",
        plateNormalised: "REG200",
        ownerName: "Updated Owner",
        ownerContact: "+60123450000",
        ownerEmail: "updated@example.com",
        ownerType: "vendor",
        staffId: "EMP-0200",
        notes: "Registry updated.",
        blacklisted: true,
      },
    });

    const deleteResponse = await deleteVehicleEndpoint(
      emptyRequest(`/api/admin/vehicles/${vehicle.id}`, token, "DELETE"),
      { params: Promise.resolve({ id: vehicle.id }) },
    );

    expect(deleteResponse.status).toBe(200);
    await expect(AppDataSource.manager.findOneBy(VehicleSchema, { id: vehicle.id })).resolves.toBeNull();
  });

  it("clears known vehicle staff id when the owner type is visitor", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);
    const vehicle = await AppDataSource.manager.save(VehicleSchema, {
      plate: "VIS REG",
      plateNormalised: "VISREG",
      ownerName: "Visitor Registry",
      ownerType: "vendor",
      staffId: "EMP-OLD",
      blacklisted: false,
    });

    const updateResponse = await updateVehicleEndpoint(
      jsonRequest(
        `/api/admin/vehicles/${vehicle.id}`,
        {
          ownerType: "visitor",
          staffId: "EMP-SHOULD-NOT-SAVE",
        },
        token,
        "PATCH",
      ),
      { params: Promise.resolve({ id: vehicle.id }) },
    );

    expect(updateResponse.status).toBe(200);
    const payload = await updateResponse.json();
    expect(payload.vehicle).toMatchObject({
      id: vehicle.id,
      ownerType: "visitor",
    });
    expect(payload.vehicle).not.toHaveProperty("staffId");

    const saved = await AppDataSource.manager.findOneByOrFail(VehicleSchema, { id: vehicle.id });
    expect(saved.staffId).toBeNull();
  });

  it("uses HR public user details for staff vehicle display and ignores duplicate owner fields", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);
    const host = await seedHrHost(AppDataSource.manager, {
      id: 88,
      empNo: "EMP-0088",
      name: "Nurul Huda",
      email: "nurul.huda@cryocord.test",
      phone: "+60128880000",
      department: "Sales Operations",
    });
    const vehicle = await AppDataSource.manager.save(VehicleSchema, {
      plate: "WPT 332",
      plateNormalised: "WPT332",
      ownerName: "Stale Registry Name",
      ownerContact: "+60000000000",
      ownerEmail: "stale@example.com",
      ownerType: "staff",
      staffId: host.staffId,
      blacklisted: false,
    });

    const updateResponse = await updateVehicleEndpoint(
      jsonRequest(
        `/api/admin/vehicles/${vehicle.id}`,
        {
          ownerType: "staff",
          ownerName: "Spoofed Owner",
          ownerContact: "+60999999999",
          ownerEmail: "spoofed@example.com",
        },
        token,
        "PATCH",
      ),
      { params: Promise.resolve({ id: vehicle.id }) },
    );

    expect(updateResponse.status).toBe(200);
    await expect(updateResponse.json()).resolves.toMatchObject({
      vehicle: {
        id: vehicle.id,
        ownerType: "staff",
        ownerName: host.name,
        ownerContact: host.phone,
        ownerEmail: host.email,
        ownerDepartment: host.department,
        staffId: host.staffId,
      },
    });

    const saved = await AppDataSource.manager.findOneByOrFail(VehicleSchema, { id: vehicle.id });
    expect(saved).toMatchObject({
      ownerName: null,
      ownerContact: null,
      ownerEmail: null,
      staffId: host.staffId,
    });

    await expect(getParkingVehicles()).resolves.toContainEqual(expect.objectContaining({
      id: vehicle.id,
      ownerName: host.name,
      ownerContact: host.phone,
      ownerEmail: host.email,
      ownerDepartment: host.department,
      staffId: host.staffId,
    }));
  });

  it("creates staff registry vehicles only with an HR directory staff owner", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);
    const host = await seedHrHost(AppDataSource.manager, {
      id: 89,
      empNo: "EMP-0089",
      name: "Aiman Staff",
      email: "aiman.staff@cryocord.test",
      phone: "+60128890000",
      department: "Operations",
    });

    const missingStaffResponse = await createVehicleEndpoint(
      jsonRequest(
        "/api/admin/vehicles",
        {
          plate: "STAFF BAD",
          ownerType: "staff",
          ownerName: "Typed Staff Name",
        },
        token,
      ),
    );

    expect(missingStaffResponse.status).toBe(400);
    await expect(missingStaffResponse.json()).resolves.toMatchObject({
      error: "Staff owner must be selected from the HR directory.",
    });

    const createResponse = await createVehicleEndpoint(
      jsonRequest(
        "/api/admin/vehicles",
        {
          plate: "STAFF OK",
          ownerType: "staff",
          ownerName: "Typed Staff Name",
          ownerContact: "+60999999999",
          ownerEmail: "typed@example.com",
          staffId: host.staffId,
        },
        token,
      ),
    );

    expect(createResponse.status).toBe(201);
    const payload = await createResponse.json();
    expect(payload.vehicle).toMatchObject({
      plate: "STAFF OK",
      plateNormalised: "STAFFOK",
      ownerType: "staff",
      ownerName: host.name,
      ownerContact: host.phone,
      ownerEmail: host.email,
      ownerDepartment: host.department,
      staffId: host.staffId,
    });

    const saved = await AppDataSource.manager.findOneByOrFail(VehicleSchema, { id: payload.vehicle.id });
    expect(saved).toMatchObject({
      ownerName: null,
      ownerContact: null,
      ownerEmail: null,
      staffId: host.staffId,
    });
  });

  it("blocks deleting a known vehicle while its plate is currently checked in", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);
    const vehicle = await AppDataSource.manager.save(VehicleSchema, {
      plate: "LIVE DEL",
      plateNormalised: "LIVEDEL",
      ownerName: "Active Owner",
      blacklisted: false,
    });
    const issued = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "LIVE DEL", typeCode: "visitor" }),
    );
    await scanVisitorPass({ token: issued.token, action: "check_in", guardId: admin.id });

    const deleteResponse = await deleteVehicleEndpoint(
      emptyRequest(`/api/admin/vehicles/${vehicle.id}`, token, "DELETE"),
      { params: Promise.resolve({ id: vehicle.id }) },
    );

    expect(deleteResponse.status).toBe(400);
    await expect(deleteResponse.json()).resolves.toEqual({
      error: "Vehicle cannot be removed while it is currently checked in.",
    });
    await expect(AppDataSource.manager.findOneBy(VehicleSchema, { id: vehicle.id })).resolves.toMatchObject({
      plate: "LIVE DEL",
    });
  });

  it("allows admins to flag and clear checked-in visitors", async () => {
    const admin = await seedParkingUser(AppDataSource.manager, { role: "admin" });
    const token = await signTestSupabaseAccessToken(admin.id);
    const issued = await createVisitorPass(
      createVisitorInputFactory({ vehicleNumber: "FLAG 100", typeCode: "visitor" }),
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

    const updateResponse = await flagVisitorEndpoint(
      jsonRequest(
        `/api/admin/visitors/${issued.visitor.id}/flag`,
        { flagReason: "Host asked security to verify before exit." },
        token,
        "PUT",
      ),
      { params: Promise.resolve({ id: issued.visitor.id }) },
    );

    expect(updateResponse.status).toBe(200);
    visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.flagReason).toBe("Host asked security to verify before exit.");

    const clearResponse = await clearVisitorFlagEndpoint(
      emptyRequest(`/api/admin/visitors/${issued.visitor.id}/flag`, token, "DELETE"),
      { params: Promise.resolve({ id: issued.visitor.id }) },
    );

    expect(clearResponse.status).toBe(200);
    visitor = await AppDataSource.manager.findOneByOrFail(VisitorSchema, { id: issued.visitor.id });
    expect(visitor.flagReason).toBeNull();
    expect(visitor.flaggedBy).toBeNull();
    expect(visitor.flaggedAt).toBeNull();

    const reviewEvents = await AppDataSource.manager.find(VisitorScanEventSchema, {
      where: { visitorId: issued.visitor.id, eventType: "details_updated" },
      order: { scannedAt: "ASC" },
    });
    expect(reviewEvents.map((event) => event.metadata.reason)).toEqual([
      "visit_marked_for_review",
      "visit_review_reason_updated",
      "visit_review_flag_cleared",
    ]);
  });
});
