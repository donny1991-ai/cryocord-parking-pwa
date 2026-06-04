import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { freshParkingDatabase } from "./parking-fresh";
import { seedStarterAdmin } from "./seeders/auth-user.seeder";
import { seedDemoJourney } from "./seeders/demo-journey.seeder";

function assertFreshIsAllowed() {
  if (process.env.NODE_ENV === "production" && process.env.CONFIRM_PARKING_MIGRATE_FRESH !== "true") {
    throw new Error(
      "Refusing to run parking migrate:fresh in production. " +
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
  const result = await freshParkingDatabase(AppDataSource);

  console.log(`Deleted ${result.deletedAuthUsers} parking-linked auth user(s).`);
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
