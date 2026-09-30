import { mkdir } from "node:fs/promises";
import path from "node:path";
import type { Db } from "./index.ts";
import * as schema from "./schema/index.ts";

/**
 * Embedded Postgres (offline edition and zero-setup local development).
 * `dataDir` undefined = in-memory (tests). Imported lazily so the cloud bundle
 * never loads PGlite's WASM.
 */
export async function connectPglite(dataDir: string | undefined, migrationsFolder: string) {
  const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([
    import("@electric-sql/pglite"),
    import("drizzle-orm/pglite"),
    import("drizzle-orm/pglite/migrator"),
  ]);
  if (dataDir) await mkdir(path.dirname(path.resolve(dataDir)), { recursive: true });
  const client = new PGlite(dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db: db as unknown as Db, client, close: () => client.close() };
}
