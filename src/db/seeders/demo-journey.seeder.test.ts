import { describe, expect, it, vi } from "vitest";
import { seedDemoJourney } from "./demo-journey.seeder";

vi.mock("./auth-user.seeder", () => ({
  seedAuthParkingUser: vi.fn(async () => ({
    id: "00000000-0000-4000-8000-000000000101",
    name: "Aziz Rahman",
  })),
}));

function createManager() {
  return {
    query: vi.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM "parking"."visitor_types"')) {
        return [{ id: 1 }];
      }

      return [];
    }),
  };
}

describe("seedDemoJourney", () => {
  it("seeds visitor vehicle rows that match demo check-in state", async () => {
    const manager = createManager();

    await seedDemoJourney(manager as never);

    const vehicleRosterCalls = manager.query.mock.calls.filter(([sql]) =>
      String(sql).includes('INSERT INTO "parking"."visitor_vehicles"'),
    );
    expect(vehicleRosterCalls).toHaveLength(10);

    const activeRosterCall = vehicleRosterCalls.find(([, params]) => params?.[1] === "00000000-0000-4000-8000-000000001002");
    expect(activeRosterCall?.[1]).toEqual([
      "00000000-0000-4000-8400-000000001002",
      "00000000-0000-4000-8000-000000001002",
      "JKL 4521",
      "JKL4521",
      "checked_in",
      "00000000-0000-4000-8000-000000000101",
    ]);
    expect(String(activeRosterCall?.[0])).toContain('"checked_out_by",');
    expect(String(activeRosterCall?.[0])).toContain("NULL");

    const exitedRosterCall = vehicleRosterCalls.find(([, params]) => params?.[1] === "00000000-0000-4000-8000-000000001008");
    expect(exitedRosterCall?.[1]?.[4]).toBe("checked_out");
    expect(String(exitedRosterCall?.[0])).toContain('"checked_out" = EXCLUDED."checked_out"');
  });
});
