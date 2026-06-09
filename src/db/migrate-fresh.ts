import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { freshParkingDatabase } from "./parking-fresh";
import { freshParkingStorageObjects } from "./parking-storage-fresh";
import { seedStarterAdmin } from "./seeders/auth-user.seeder";
import { seedDemoJourney } from "./seeders/demo-journey.seeder";

function getTargetDatabaseUrl() {
  return process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? "";
}

function isLocalDatabaseUrl(databaseUrl: string) {
  if (!databaseUrl) {
    return false;
  }

  try {
    const hostname = new URL(databaseUrl).hostname.toLowerCase();
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1" || hostname === "host.docker.internal";
  } catch {
    return false;
  }
}

function assertFreshIsAllowed() {
  const targetDatabaseUrl = getTargetDatabaseUrl();
  const isRemoteDatabase = !isLocalDatabaseUrl(targetDatabaseUrl);

  if ((process.env.NODE_ENV === "production" || isRemoteDatabase) && process.env.CONFIRM_PARKING_MIGRATE_FRESH !== "true") {
    throw new Error(
      "Refusing to run parking migrate:fresh against a production or remote database. " +
        "Set CONFIRM_PARKING_MIGRATE_FRESH=true if this is intentional.",
    );
  }
}

async function main() {
  assertFreshIsAllowed();

  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const shouldSeed = process.argv.includes("--seed");
  const shouldSeedDemo = process.argv.includes("--demo");
  const storage = await freshParkingStorageObjects();
  if (storage.skipped) {
    console.log(`Skipped parking storage cleanup: ${storage.reason}`);
  } else {
    console.log(
      `Removed ${storage.objectsRemoved} parking storage object(s) from bucket ${storage.bucket} under ${storage.prefixes.join(", ")}`,
    );
  }

  const result = await freshParkingDatabase(AppDataSource);

  console.log("Preserved Supabase auth.users; no auth users were deleted.");
  console.log(`Ran ${result.migrationsRun} migration(s).`);

  if (shouldSeed) {
    const admin = await seedStarterAdmin(AppDataSource.manager);
    console.log(`Seeded parking admin: ${admin.name} (${admin.role})`);
  }

  if (shouldSeedDemo) {
    const demo = await seedDemoJourney(AppDataSource.manager);
    console.log(
      `Seeded demo journey: ${demo.visitsSeeded} visits, ${demo.vehiclesSeeded} vehicles, guard ${demo.guard.name}`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
    }
  });
