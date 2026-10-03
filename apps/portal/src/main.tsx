import "@fontsource-variable/dm-sans";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Toaster } from "sonner";
import { router } from "./router.tsx";

const queryClient = new QueryClient({
  defaultOptions: { queries: { refetchOnWindowFocus: true, staleTime: 20_000, retry: 1 } },
});

// Follow the device's light/dark setting as it changes.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => document.documentElement.classList.toggle("dark-mode", e.matches));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster theme="system" position="bottom-right" toastOptions={{ className: "!font-sans" }} />
    </QueryClientProvider>
  </StrictMode>,
);
