import { BackgroundPattern, Button, Logo } from "@operant/ui";
import { AlertCircle, ArrowRight, Banknote, FolderKanban, Globe, HelpCircle, MessagesSquare, Sparkles, Users } from "lucide-react";
import { signIn, useAuthConfig } from "../lib/api.ts";

const ERRORS: Record<string, string> = {
  login_expired: "Your sign-in took too long. Try again.",
  login_failed: "We couldn't complete sign-in. Try again.",
};

const PILLARS = [
  { label: "People", text: "Directory & leave", icon: Users, accent: "rgba(52, 211, 153, 0.15)", textAccent: "#34d399" },
  { label: "Work", text: "Projects & goals", icon: FolderKanban, accent: "rgba(251, 146, 60, 0.15)", textAccent: "#fb923c" },
  { label: "Sync", text: "Channels & threads", icon: MessagesSquare, accent: "rgba(96, 165, 250, 0.15)", textAccent: "#60a5fa" },
  { label: "Finance", text: "Invoices & GST", icon: Banknote, accent: "rgba(251, 191, 36, 0.15)", textAccent: "#fbbf24" },
];

export function SignInPage({ variant = "sign-in" }: { variant?: "sign-in" | "signed-out" }) {
  const { data: config } = useAuthConfig();
  const error = ERRORS[new URLSearchParams(window.location.search).get("error") ?? ""];

  return (
    <div className="flex min-h-dvh w-full bg-[#f8fafc] text-zinc-800 antialiased dark:bg-[#0b0f19] dark:text-zinc-100">
      
      {/* ─── LEFT: AUTH FORM PANEL ─── */}
      <section className="relative flex flex-1 flex-col justify-between p-6 sm:p-10 lg:max-w-135 xl:max-w-145">
        {/* Top bar: Brand Icon + Switcher */}
        <header className="flex items-center justify-between">
          <div className="flex size-9 items-center justify-center rounded-full bg-zinc-900 text-white shadow-xs dark:bg-white dark:text-zinc-900">
            <Logo className="size-5" />
          </div>

          {config?.sso !== false && (
            <div className="text-xs text-zinc-500 dark:text-zinc-400">
              New here?{" "}
              <button
                type="button"
                onClick={() => signIn("/", "create")}
                className="font-medium text-zinc-900 underline-offset-4 hover:underline dark:text-white"
              >
                Create account
              </button>
            </div>
          )}
        </header>

        {/* Center Auth Card */}
        <div className="mx-auto my-auto w-full max-w-sm py-8">
          <div className="flex flex-col items-center text-center">

            <h1 className="text-xl font-semibold tracking-tight text-zinc-900 dark:text-white sm:text-2xl">
              {variant === "signed-out" ? "You're signed out" : "Login to Operant"}
            </h1>
            <p className="mt-1.5 text-xs text-zinc-500 dark:text-zinc-400">
              {variant === "signed-out"
                ? "Sign in whenever you're ready to get back to work."
                : "One Webrizen SSO account for all your workspace apps."}
            </p>
          </div>

          {error && (
            <div className="mt-5 flex items-start gap-2.5 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600 dark:border-red-900/40 dark:bg-red-950/20 dark:text-red-400">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Action Area */}
          <div className="mt-6 space-y-3">
            <Button
              variant="primary"
              className="group relative flex h-11 w-min whitespace-nowrap items-center justify-center gap-2.5 rounded-full bg-zinc-900 px-6 mx-auto text-xs font-medium text-white shadow-sm transition hover:bg-zinc-800 active:scale-[0.99] dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-100"
              onClick={() => signIn("/")}
            >
              <img src="https://webrizen.com/icon.png" alt="Webrizen" className="size-8 object-contain" />
              <span>{config?.sso === false && config.devAuth ? "Continue with Demo" : "Continue with Webrizen SSO"}</span>
              <ArrowRight className="size-3.5 opacity-60 transition group-hover:tranzinc-x-0.5" />
            </Button>
          </div>

          <p className="mt-8 text-center text-[11px] leading-relaxed text-zinc-400">
            Protected by Webrizen Unified Access. By continuing, you accept our standard terms & privacy guidelines.
          </p>
        </div>

        {/* Footer Meta */}
        <footer className="flex items-center justify-between text-[11px] text-zinc-400">
          <span>© {new Date().getFullYear()} Webrizen AI Labs Pvt. Ltd.</span>
          <span className="flex items-center gap-1.5">
            <Globe className="size-3.5" />
            <span>EN</span>
          </span>
        </footer>
      </section>

      {/* ─── RIGHT: FLOATING HERO DISPLAY PANEL ─── */}
      <section className="relative hidden p-3 lg:flex lg:flex-1">
        <div className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-3xl bg-linear-to-br from-zinc-900 via-indigo-950 to-zinc-950 p-10 text-white shadow-xl xl:p-14">
          
          {/* Subtle Ambient Light Gradients */}
          <div className="pointer-events-none absolute -top-24 -right-24 size-96 rounded-full bg-indigo-500/20 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-32 -left-20 size-80 rounded-full bg-sky-500/15 blur-3xl" />
          <BackgroundPattern pattern="grid" size="md" className="pointer-events-none absolute inset-0 opacity-10 text-white" />

          {/* Header Brand */}
          <header className="relative flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-full bg-white/10 ring-1 ring-white/15 backdrop-blur-md">
              <Logo className="size-5 text-white" />
            </div>
            <div className="flex flex-col -space-y-1">
              <span className="font-semibold tracking-wider uppercase text-white/90">Operant</span>
              <p className="text-xs text-white/50">By Webrizen AI Labs.</p>
            </div>
          </header>

          {/* Main Hero Pitch + Compact Pillars */}
          <div className="relative my-auto max-w-5xl py-6">
            <h2 className="text-2xl font-semibold tracking-tight text-white xl:text-3xl">
              Run the whole company, <br />
              <span className="text-white/60">from one single place.</span>
            </h2>

            <p className="mt-3 text-xs leading-relaxed text-white/60 max-w-sm">
              People, projects, GST invoicing, and real-time team chats connected within an integrated workspace.
            </p>

            {/* Feature Pills */}
            <div className="mt-8 grid grid-cols-4 gap-2.5">
              {PILLARS.map((p, index) => (
                <div
                  key={p.label}
                  className={`flex items-center gap-2.5 rounded-none border border-white/10 bg-white/3 p-3 backdrop-blur-md transition hover:border-white/20 hover:bg-white/6 ${index === 0 ? "rounded-l-full" : index === 3 ? "rounded-r-full" : ""}`}
                >
                  <span
                    className="flex size-7 shrink-0 items-center justify-center rounded-full"
                    style={{ backgroundColor: p.accent, color: p.textAccent }}
                  >
                    <p.icon className="size-3.5" />
                  </span>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-white/90">{p.label}</div>
                    <div className="truncate text-[10px] text-white/50">{p.text}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Inset Double Footer Info (from inspiration design) */}
          <footer className="relative grid grid-cols-2 gap-6 border-t border-white/10 pt-6 text-xs">
            <div>
              <div className="font-medium text-white/80">Operant Cloud</div>
              <p className="mt-0.5 text-[11px] text-white/50">Multi-tenant enterprise suite by Webrizen AI Labs.</p>
            </div>
            <div>
              <div className="font-medium text-white/80">Need Help?</div>
              <p className="mt-0.5 text-[11px] text-white/50">Contact your organization administrator or Webrizen Support.</p>
            </div>
          </footer>
        </div>
      </section>

    </div>
  );
}