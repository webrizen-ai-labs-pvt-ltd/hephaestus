import { BackgroundPattern, Button, Logo } from "@hephaestus/ui";
import { AlertCircle, ArrowRight, Banknote, FolderKanban, MessagesSquare, Users } from "lucide-react";
import { signIn, useAuthConfig } from "../lib/api.ts";

const ERRORS: Record<string, string> = {
  login_expired: "Your sign-in took too long. Try again.",
  login_failed: "We couldn't complete sign-in. Try again.",
};

const PILLARS = [
  { label: "People", text: "Directory, leave, onboarding", icon: Users, color: "#47cd89" },
  { label: "Work", text: "Projects, boards, goals", icon: FolderKanban, color: "#ff9a7a" },
  { label: "Collaboration", text: "Channels, threads, decisions", icon: MessagesSquare, color: "#a5c0fa" },
  { label: "Finance", text: "GST invoices, payments", icon: Banknote, color: "#f1c75b" },
];

export function SignInPage({ variant = "sign-in" }: { variant?: "sign-in" | "signed-out" }) {
  const { data: config } = useAuthConfig();
  const error = ERRORS[new URLSearchParams(window.location.search).get("error") ?? ""];

  return (
    <div className="grid min-h-dvh bg-primary lg:grid-cols-2">
      {/* Form side: Untitled UI log-in layout with a grid pattern behind the header. */}
      <section className="relative flex items-center justify-center overflow-hidden px-4 py-12 sm:px-8">
        <div className="relative w-full max-w-90">
          <div className="relative flex flex-col items-center text-center">
            <BackgroundPattern pattern="grid" size="md" className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-border-secondary" />
            <span className="relative flex size-12 items-center justify-center rounded-xl bg-brand-solid text-white shadow-xs-skeuomorphic ring-1 ring-transparent ring-inset">
              <Logo className="size-9" />
            </span>
            <h1 className="relative mt-6 text-display-xs font-semibold text-primary">{variant === "signed-out" ? "You're signed out" : "Welcome back"}</h1>
            <p className="relative mt-2 text-md text-tertiary">
              {variant === "signed-out" ? "Sign in again whenever you're ready." : "Use your Webrizen account. One account works across every Webrizen product."}
            </p>
          </div>

          {error ? (
            <div className="relative mt-8 flex items-start gap-3 rounded-xl bg-error-primary p-4 ring-1 ring-error_subtle ring-inset">
              <AlertCircle className="mt-0.5 size-5 shrink-0 text-fg-error-primary" />
              <p className="text-sm font-medium text-error-primary">{error}</p>
            </div>
          ) : null}

          <div className="relative mt-8 flex flex-col gap-3">
            <Button variant="primary" size="lg" className="w-full" onClick={() => signIn("/")}>
              <Logo className="size-5" />
              {config?.sso === false && config.devAuth ? "Continue with demo account" : "Sign in with Webrizen"}
              <ArrowRight className="ml-auto" />
            </Button>
            {config?.sso !== false ? (
              <Button variant="secondary" size="lg" className="w-full" onClick={() => signIn("/", "create")}>
                Create a Webrizen account
              </Button>
            ) : (
              <p className="text-center text-sm text-tertiary">Webrizen SSO isn't configured yet, so you'll use a local demo account.</p>
            )}
          </div>

          <p className="relative mt-8 text-center text-sm text-tertiary">
            By signing in you agree to Webrizen's terms. <span className="font-semibold text-brand-secondary">Hephaestus</span> by Webrizen AI Labs.
          </p>
        </div>
      </section>

      {/* Brand side: Untitled UI brand section with the four pillars. */}
      <section className="relative hidden overflow-hidden bg-brand-section p-12 lg:flex lg:flex-col">
        <BackgroundPattern pattern="grid" size="lg" className="absolute -top-24 -right-24 text-white/10" />
        <div className="pointer-events-none absolute -bottom-48 -left-24 size-[560px] rounded-full bg-brand-solid/40 blur-3xl" />
        <div className="relative flex items-center gap-2.5 text-white">
          <Logo className="size-8" />
          <span className="font-display text-lg font-bold">Hephaestus</span>
        </div>
        <div className="relative my-auto max-w-lg">
          <p className="text-sm font-semibold text-brand-200">By Webrizen</p>
          <h2 className="mt-3 font-display text-display-lg font-semibold tracking-tight text-white">
            Run the whole company,
            <br />
            from one place.
          </h2>
          <p className="mt-5 max-w-md text-lg text-brand-100/80">People, projects, payments and conversations, all connected.</p>
          <ul className="mt-10 grid max-w-lg grid-cols-2 gap-3">
            {PILLARS.map((p) => (
              <li key={p.label} className="flex items-start gap-3 rounded-xl bg-white/8 p-4 ring-1 ring-white/12 ring-inset backdrop-blur">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15 ring-inset" style={{ color: p.color }}>
                  <p.icon className="size-5" />
                </span>
                <div>
                  <div className="text-sm font-semibold text-white">{p.label}</div>
                  <div className="text-xs text-brand-100/70">{p.text}</div>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-brand-100/60">© {new Date().getFullYear()} Webrizen AI Labs Pvt Ltd</p>
      </section>
    </div>
  );
}
