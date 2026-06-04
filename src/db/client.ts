import "server-only";
import { AppDataSource } from "./data-source";

export async function getParkingDataSource() {
  if (process.env.NODE_ENV === "test") {
    if (!process.env.TEST_DATABASE_URL && !process.env.SUPABASE_TEST_DB_URL) {
      throw new Error("TEST_DATABASE_URL or SUPABASE_TEST_DB_URL is required for isolated test database operations.");
    }
  } else if (!process.env.DATABASE_URL && !process.env.SUPABASE_DB_URL) {
    throw new Error("DATABASE_URL or SUPABASE_DB_URL is required for visitor database operations.");
  }

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  return AppDataSource;
}
