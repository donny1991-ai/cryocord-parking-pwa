import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppDataSource } from "@/db/data-source";
import { VisitorScanEventSchema, VisitorSchema } from "@/db/entities";
import { createVisitorInputFactory } from "@/test/factories/visitor.factory";
import { seedVisitorTypes } from "@/test/seeders/visitor-type.seeder";
import { signVisitToken } from "@/lib/qr";
import { createVisitorPass, scanVisitorPass } from "./visitors";

describe("visitor pass database flow", () => {
  beforeAll(async () => {
    if (!AppDataSource.isInitialized) {
      await AppDataSource.initialize();
    }
    await AppDataSource.runMigrations();
    await seedVisitorTypes(AppDataSource.manager);
  });

  beforeEach(async () => {
    await AppDataSource.query(`TRUNCATE TABLE "parking"."visitor_scan_events", "parking"."visitors" RESTART IDENTITY CASCADE`);
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
});
