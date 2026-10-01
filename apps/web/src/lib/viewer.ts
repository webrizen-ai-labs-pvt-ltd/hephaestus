import { createContext, use } from "react";
import type { Me } from "./api.ts";

/*
 * The signed-in viewer, provided once by the app root. Kept in its own module
 * so editing the router during development doesn't recreate the context (and
 * leave mounted pages without a viewer).
 */
export const MeContext = createContext<Me | null>(null);

export function useViewer() {
  const me = use(MeContext);
  if (!me) throw new Error("useViewer outside the signed-in app");
  return me;
}
