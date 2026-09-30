import type { PermissionSet } from "./permissions.ts";

/** The signed-in person as seen by the API, regardless of edition. */
export interface Viewer {
  userId: string;
  email: string;
  name: string;
  image: string | null;
  org: ViewerOrg | null;
}

export interface ViewerOrg {
  id: string;
  name: string;
  slug: string;
  logo: string | null;
  roles: string[];
  permissions: PermissionSet;
}
