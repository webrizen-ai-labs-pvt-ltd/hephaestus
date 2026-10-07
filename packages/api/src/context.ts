import type { Edition, FileStore, Mailer, Realtime, Viewer } from "@operant/core";
import type { Db } from "@operant/db";
import type { SecretBox } from "./secrets.ts";

/** Everything an edition must provide to run the API. */
export interface ApiDeps {
  edition: Edition;
  db: Db;
  files: FileStore;
  realtime: Realtime;
  mailer: Mailer;
  /** Encrypts secrets stored in the database (payment gateway keys). */
  secrets: SecretBox;
  /** Public base URL of the app, for links in emails (e.g. https://operant.webrizen.com). */
  appUrl: string;
  /** Public base URL of the client portal app, for links in client emails. */
  portalUrl?: string;
  /** Resolve the signed-in viewer from the request (cookie session), or null. */
  resolveViewer(req: Request): Promise<Viewer | null>;
}

export interface ActiveOrg {
  /** Operant org row id (always use this for org_id columns). */
  id: string;
  name: string;
  slug: string;
}

export type AppEnv = {
  Variables: {
    deps: ApiDeps;
    viewer: Viewer | null;
    org: ActiveOrg;
    /** Set on client portal routes: the signed-in client person. */
    portalUser: PortalViewer;
  };
};

export interface PortalViewer {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  clientId: string | null;
}
