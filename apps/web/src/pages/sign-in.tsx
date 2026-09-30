import { Button, Logo } from "@hephaestus/ui";
import { ArrowRight } from "lucide-react";
import { signIn, useAuthConfig } from "../lib/api.ts";

const ERRORS: Record<string, string> = {
  login_expired: "Your sign-in took too long. Try again.",
  login_failed: "We couldn't complete sign-in. Try again.",
};

export function SignInPage({ variant = "sign-in" }: { variant?: "sign-in" | "signed-out" }) {
  const { data: config } = useAuthConfig();
  const error = ERRORS[new URLSearchParams(window.location.search).get("error") ?? ""];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-obsidian p-12 text-ash lg:flex lg:flex-col">
        <div className="flex items-center gap-2.5">
          <Logo className="size-8 text-ash" />
          <span className="font-display text-lg font-bold">Hephaestus</span>
        </div>
        <div className="my-auto max-w-lg">
          <p className="font-mono text-xs uppercase tracking-[0.14em] text-ember">By Webrizen</p>
          <h1 className="mt-4 font-display text-6xl font-bold leading-[0.98] tracking-tight">
            Forge the work.
            <br />
            <span className="text-ember">Collect the value.</span>
          </h1>
          <p className="mt-6 max-w-md text-base leading-relaxed text-[#bdb5a8]">
            People, projects, payments and conversations, cast in one place.
          </p>
          <div className="mt-10 grid max-w-md grid-cols-4 gap-2">
            {[
              ["People", "#4fbf97"],
              ["Work", "#ff5a1f"],
              ["Collab", "#7fa1d1"],
              ["Finance", "#d9b865"],
            ].map(([label, color]) => (
              <div key={label} className="rounded-lg bg-forge px-3 py-2.5" style={{ borderTop: `3px solid ${color}` }}>
                <div className="text-xs" style={{ color }}>
                  {label}
                </div>
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs text-[#7d756b]">© {new Date().getFullYear()} Webrizen AI Labs Pvt Ltd</p>
        {/* Molten glow */}
        <div className="pointer-events-none absolute -bottom-40 -right-40 size-[520px] rounded-full bg-ember/20 blur-3xl" />
      </section>

      <section className="flex items-center justify-center p-6">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <Logo className="size-8 text-foreground" />
            <span className="font-display text-lg font-bold">Hephaestus</span>
          </div>
          <h2 className="text-3xl font-bold">{variant === "signed-out" ? "You're signed out" : "Welcome back"}</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {variant === "signed-out"
              ? "Sign in again whenever you're ready."
              : "Use your Webrizen account. One account works across every Webrizen product."}
          </p>

          {error ? <p className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger">{error}</p> : null}

          <Button variant="primary" size="lg" className="mt-8 w-full" onClick={() => signIn("/")}>
            <Logo className="size-5" />
            {config?.sso === false && config.devAuth ? "Continue with demo account" : "Sign in with Webrizen"}
            <ArrowRight className="ml-auto" />
          </Button>

          {config?.sso !== false ? (
            <Button variant="ghost" className="mt-2 w-full" onClick={() => signIn("/", "create")}>
              New here? Create a Webrizen account
            </Button>
          ) : (
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Webrizen SSO isn't configured yet, so you'll use a local demo account.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
