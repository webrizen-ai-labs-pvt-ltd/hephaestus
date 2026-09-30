import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import * as schema from "./schema/index.ts";
import type { Db } from "./index.ts";

/**
 * Cloud connection (Supabase). Use the transaction pooler URL (port 6543) on
 * serverless; prepared statements must be off with that pooler.
 */
export async function connectPostgres(url: string, opts: { migrate?: boolean; migrationsFolder?: string } = {}) {
  const client = postgres(url, { prepare: false, max: 5 });
  const db = drizzle(client, { schema });
  if (opts.migrate && opts.migrationsFolder) await migrate(db, { migrationsFolder: opts.migrationsFolder });
  return { db: db as unknown as Db, close: () => client.end() };
}
