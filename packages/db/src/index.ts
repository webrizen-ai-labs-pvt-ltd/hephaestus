import { fileURLToPath } from "node:url";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema/index.ts";

export { schema };
export * from "./schema/index.ts";

/** Works with both engines: postgres-js (cloud) and PGlite (offline / local dev). */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Absolute path to the SQL migrations shared by both engines. */
export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

export { connectPostgres } from "./postgres.ts";
export { connectPglite } from "./pglite.ts";
