import { Button, Logo } from "@hephaestus/ui";
import { createRootRoute, createRoute, createRouter, Link } from "@tanstack/react-router";
import { createContext, use } from "react";
import { AppShell } from "./components/app-shell.tsx";
import { ApiError, type Me, signIn, signOut, useMe } from "./lib/api.ts";
import { HomePage } from "./pages/home.tsx";
import { PillarPage } from "./pages/pillars.tsx";
import { AuditPage, OrgSettingsPage, PreferencesPage } from "./pages/settings.tsx";
import { SignInPage } from "./pages/sign-in.tsx";

const MeContext = createContext<Me | null>(null);

export function useViewer() {
  const me = use(MeContext);
  if (!me) throw new Error("useViewer outside the signed-in app");
  return me;
}

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Logo className="size-10 animate-pulse text-primary" />
    </div>
  );
}

function NoOrganization() {
  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <Logo className="mx-auto size-10 text-foreground" />
        <h1 className="mt-6 text-2xl font-bold">Join an organization</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Hephaestus works inside an organization. Create one in your Webrizen account, or ask your admin for an invite.
        </p>
        <div className="mt-6 flex flex-col gap-2">
          <Button variant="primary" onClick={() => signIn("/", "select_account")}>
            Choose an organization
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}

function Root() {
  const { data: me, error, isLoading } = useMe();
  if (isLoading) return <Splash />;
  if (error instanceof ApiError && error.status === 401) return <SignInPage />;
  if (error instanceof ApiError && error.status === 403) return <NoOrganization />;
  if (error || !me) {
    return (
      <div className="flex min-h-dvh items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-2xl font-bold">We can't reach Hephaestus</h1>
          <p className="mt-2 text-sm text-muted-foreground">Check your connection, then try again.</p>
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Try again
          </Button>
        </div>
      </div>
    );
  }
  return (
    <MeContext value={me}>
      <AppShell me={me} />
    </MeContext>
  );
}

const rootRoute = createRootRoute({
  component: Root,
  notFoundComponent: () => (
    <div className="p-8">
      <h1 className="text-2xl font-bold">Page not found</h1>
      <Link to="/" className="mt-2 inline-block text-sm text-accent hover:underline">
        Go home
      </Link>
    </div>
  ),
});

const page = <P extends string>(path: P, Component: () => React.ReactNode) =>
  createRoute({ getParentRoute: () => rootRoute, path, component: Component });

const routeTree = rootRoute.addChildren([
  page("/", () => <HomePage me={useViewer()} />),
  page("/people", () => <PillarPage me={useViewer()} path="/people" />),
  page("/work", () => <PillarPage me={useViewer()} path="/work" />),
  page("/collab", () => <PillarPage me={useViewer()} path="/collab" />),
  page("/finance", () => <PillarPage me={useViewer()} path="/finance" />),
  page("/settings", () => <OrgSettingsPage me={useViewer()} />),
  page("/settings/audit", () => <AuditPage me={useViewer()} />),
  page("/settings/preferences", () => <PreferencesPage />),
]);

export const router = createRouter({ routeTree, defaultPreload: "intent" });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
