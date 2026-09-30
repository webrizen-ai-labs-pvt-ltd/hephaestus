import type { Edition, FileStore, Mailer, Realtime, Viewer } from "@hephaestus/core";
import type { Db } from "@hephaestus/db";

/** Everything an edition must provide to run the API. */
export interface ApiDeps {
  edition: Edition;
  db: Db;
  files: FileStore;
  realtime: Realtime;
  mailer: Mailer;
  /** Resolve the signed-in viewer from the request (cookie session), or null. */
  resolveViewer(req: Request): Promise<Viewer | null>;
}

export interface ActiveOrg {
  /** Hephaestus org row id (always use this for org_id columns). */
  id: string;
  name: string;
  slug: string;
}

export type AppEnv = {
  Variables: {
    deps: ApiDeps;
    viewer: Viewer | null;
    org: ActiveOrg;
  };
};
