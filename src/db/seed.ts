import "reflect-metadata";
import { AppDataSource } from "./data-source";
import { seedStarterAdmin } from "./seeders/auth-user.seeder";
import { seedCompanies } from "./seeders/company.seeder";
import { seedDemoJourney } from "./seeders/demo-journey.seeder";

async function main() {
  if (!AppDataSource.isInitialized) {
    await AppDataSource.initialize();
  }

  const admin = await seedStarterAdmin(AppDataSource.manager);
  console.log(`Seeded parking admin: ${admin.name} (${admin.role})`);
  const companies = await seedCompanies(AppDataSource.manager);
  console.log(`Seeded companies: ${companies.map((company) => company.name).join(", ")}`);

  if (process.argv.includes("--demo")) {
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
