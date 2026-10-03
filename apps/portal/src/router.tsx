import { createRootRoute, createRoute, createRouter, Outlet } from "@tanstack/react-router";
import { OrgShell } from "./components/shell.tsx";
import { AccountPage, BillingPage } from "./pages/billing.tsx";
import { DirectoryPage } from "./pages/directory.tsx";
import { OrgHomePage } from "./pages/home.tsx";
import { DocumentsPage, ProjectPage } from "./pages/project.tsx";
import { RequestPage } from "./pages/request.tsx";
import { ServicePage, ServicesPage } from "./pages/services.tsx";
import { SignInPage } from "./pages/sign-in.tsx";

const root = createRootRoute({ component: Outlet });

const directory = createRoute({ getParentRoute: () => root, path: "/", component: DirectoryPage });

/** Everything under /:slug belongs to one organization's portal. */
const org = createRoute({ getParentRoute: () => root, path: "$slug", component: OrgShell });
const orgHome = createRoute({ getParentRoute: () => org, path: "/", component: OrgHomePage });
const signIn = createRoute({
  getParentRoute: () => org,
  path: "sign-in",
  component: SignInPage,
  validateSearch: (s: Record<string, unknown>): { next?: string } => (typeof s.next === "string" ? { next: s.next } : {}),
});
const services = createRoute({ getParentRoute: () => org, path: "services", component: ServicesPage });
const service = createRoute({ getParentRoute: () => org, path: "services/$id", component: ServicePage });
const request = createRoute({ getParentRoute: () => org, path: "requests/$id", component: RequestPage });
const project = createRoute({ getParentRoute: () => org, path: "projects/$id", component: ProjectPage });
const documents = createRoute({ getParentRoute: () => org, path: "documents", component: DocumentsPage });
const billing = createRoute({ getParentRoute: () => org, path: "billing", component: BillingPage });
const account = createRoute({ getParentRoute: () => org, path: "account", component: AccountPage });

const routeTree = root.addChildren([directory, org.addChildren([orgHome, signIn, services, service, request, project, documents, billing, account])]);

export const router = createRouter({ routeTree, defaultPreload: "intent", scrollRestoration: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
