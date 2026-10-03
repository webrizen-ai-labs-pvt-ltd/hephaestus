import "@fontsource-variable/bricolage-grotesque";
import "@fontsource-variable/inter";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { PublicInvoicePage } from "./pages/finance/public-invoice.tsx";
import { SignInPage } from "./pages/sign-in.tsx";
import { router } from "./router.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 30_000 } },
});

// The signed-out landing page lives outside the app shell (no session to load).
const isSignedOut = window.location.pathname === "/signed-out";
// Client-facing document links work without signing in.
const isPublicInvoice = window.location.pathname.startsWith("/i/");

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {isPublicInvoice ? <PublicInvoicePage /> : isSignedOut ? <SignInPage variant="signed-out" /> : <RouterProvider router={router} />}
      <Toaster theme="system" position="bottom-right" toastOptions={{ className: "!font-sans" }} />
    </QueryClientProvider>
  </StrictMode>,
);
