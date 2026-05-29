import "reflect-metadata";
import dotenv from "dotenv";
import { DataSource } from "typeorm";
import { VisitorScanEventSchema } from "./entities/visitor-scan-event.entity";
import { VisitorSchema } from "./entities/visitor.entity";
import { VisitorTypeSchema } from "./entities/visitor-type.entity";
import { assertSafeTestDatabaseUrl, getConfiguredTestDatabaseUrl } from "./test-guard";

if (process.env.NODE_ENV === "test") {
  dotenv.config({ path: ".env.test" });
} else {
  dotenv.config();
}

const databaseUrl =
  process.env.NODE_ENV === "test"
    ? getConfiguredTestDatabaseUrl()
    : process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL;

const sslMode =
  process.env.NODE_ENV === "test"
    ? process.env.TEST_DATABASE_SSL ?? process.env.SUPABASE_TEST_DB_SSL
    : process.env.DATABASE_SSL ?? process.env.SUPABASE_DB_SSL;

if (process.env.NODE_ENV === "test") {
  assertSafeTestDatabaseUrl(databaseUrl);
}

export const AppDataSource = new DataSource({
  type: "postgres",
  url: databaseUrl,
  entities: [VisitorTypeSchema, VisitorSchema, VisitorScanEventSchema],
  migrations: ["src/db/migrations/*.{ts,js}"],
  migrationsTableName: "typeorm_migrations",
  synchronize: false,
  logging: process.env.TYPEORM_LOGGING === "true",
  ssl:
    sslMode === "true"
      ? { rejectUnauthorized: process.env.DATABASE_SSL_REJECT_UNAUTHORIZED !== "false" }
      : false,
});
