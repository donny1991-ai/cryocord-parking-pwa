import type { DataSource } from "typeorm";
import { freshParkingDatabase } from "@/db/parking-fresh";

/**
 * Laravel-style RefreshDatabase for the isolated integration database.
 * We only rebuild the application-owned parking schema; Supabase-managed
 * schemas such as auth/storage remain intact.
 */
export async function refreshParkingTestDatabase(dataSource: DataSource) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("refreshParkingTestDatabase can only run under NODE_ENV=test.");
  }

  await freshParkingDatabase(dataSource);
}
