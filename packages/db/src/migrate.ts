import { connectPostgres, migrationsFolder } from "./index.ts";

/**
 * Applies migrations to the cloud database. Use the DIRECT connection string
 * (port 5432), not the transaction pooler.
 *   DATABASE_URL=postgres://... pnpm db:migrate
 */
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL to the Supabase direct connection string.");
  process.exit(1);
}
const { close } = await connectPostgres(url, { migrate: true, migrationsFolder });
await close();
console.info("Migrations applied.");
