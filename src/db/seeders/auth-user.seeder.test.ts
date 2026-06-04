import { describe, expect, it, vi } from "vitest";
import { seedAuthParkingUser } from "./auth-user.seeder";

function createManager(existingAuthUser?: { id: string; email?: string }) {
  return {
    query: vi
      .fn()
      .mockResolvedValueOnce(existingAuthUser ? [existingAuthUser] : [])
      .mockResolvedValue([]),
    findOneByOrFail: vi.fn().mockImplementation(async (_schema, where) => ({
      id: where.id,
      name: "Parking Admin",
      role: "admin",
      active: true,
    })),
  };
}

describe("seedAuthParkingUser", () => {
  it("reuses an existing auth user by email without updating auth.users", async () => {
    const existingAuthUserId = "11111111-1111-4111-8111-111111111111";
    const manager = createManager({ id: existingAuthUserId, email: "admin@example.com" });

    await seedAuthParkingUser(manager as never, {
      email: "Admin@Example.com",
      name: "Parking Admin",
      role: "admin",
    });

    const sqlStatements = manager.query.mock.calls.map(([sql]) => String(sql));
    expect(sqlStatements).toHaveLength(2);
    expect(sqlStatements.some((sql) => sql.includes('INSERT INTO "auth"."users"'))).toBe(false);
    expect(sqlStatements.some((sql) => sql.includes('INSERT INTO "parking"."users"'))).toBe(true);
    expect(manager.query.mock.calls[1][1]).toEqual([
      existingAuthUserId,
      "Parking Admin",
      null,
      "admin",
      true,
    ]);
  });

  it("reuses an existing requested auth id when the email lookup does not match", async () => {
    const existingAuthUserId = "00000000-0000-4000-8000-000000000101";
    const manager = createManager({ id: existingAuthUserId, email: "old.guard@parking.test" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      await seedAuthParkingUser(manager as never, {
        id: existingAuthUserId,
        email: "aziz.guard@parking.test",
        name: "Aziz Rahman",
        role: "guard",
      });
    } finally {
      warn.mockRestore();
    }

    const sqlStatements = manager.query.mock.calls.map(([sql]) => String(sql));
    expect(sqlStatements).toHaveLength(2);
    expect(sqlStatements.some((sql) => sql.includes('INSERT INTO "auth"."users"'))).toBe(false);
    expect(manager.query.mock.calls[1][1]).toEqual([
      existingAuthUserId,
      "Aziz Rahman",
      null,
      "guard",
      true,
    ]);
  });

  it("creates an auth user when the email does not exist", async () => {
    const manager = createManager();

    await seedAuthParkingUser(manager as never, {
      id: "22222222-2222-4222-8222-222222222222",
      email: "admin@example.com",
      name: "Parking Admin",
      role: "admin",
    });

    const sqlStatements = manager.query.mock.calls.map(([sql]) => String(sql));
    expect(sqlStatements).toHaveLength(3);
    expect(sqlStatements.some((sql) => sql.includes('INSERT INTO "auth"."users"'))).toBe(true);
    expect(sqlStatements.some((sql) => sql.includes('INSERT INTO "parking"."users"'))).toBe(true);
  });
});
