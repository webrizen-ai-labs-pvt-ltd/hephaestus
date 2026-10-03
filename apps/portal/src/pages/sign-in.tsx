import { Button, Field, Input } from "@hephaestus/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ArrowLeft, Mail } from "lucide-react";
import { useState } from "react";
import { OrgMark, useSlug } from "../components/shell.tsx";
import { api, ApiError, useOrgPage } from "../lib/api.ts";

/** Email, then a 6-digit code. New people get an account on their first sign-in. */
export function SignInPage() {
  const slug = useSlug();
  const { next } = useSearch({ strict: false }) as { next?: string };
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: page } = useOrgPage(slug);
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devHint, setDevHint] = useState(false);

  const sendCode = async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ emailConfigured: boolean }>(`portal/orgs/${slug}/auth/code`, { method: "POST", body: JSON.stringify({ email }) });
      setDevHint(!r.emailConfigured);
      setStep("code");
    } catch (e) {
      setError((e as ApiError).message);
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(`portal/orgs/${slug}/auth/verify`, { method: "POST", body: JSON.stringify({ email, code }) });
      await qc.invalidateQueries();
      // Only ever return to a page inside this portal.
      const back = next && next.startsWith(`/${slug}`) && !next.startsWith("//") ? next : `/${slug}`;
      await navigate({ to: back });
    } catch (e) {
      setError((e as ApiError).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-md py-6">
      <div className="rounded-2xl border border-secondary bg-primary p-6 shadow-xs sm:p-8">
        {page ? <OrgMark name={page.org.name} logo={page.org.logo} className="size-12" /> : null}
        <h1 className="mt-5 text-display-xs font-semibold">{step === "email" ? `Sign in to ${page?.org.name ?? "the portal"}` : "Check your email"}</h1>
        <p className="mt-2 text-sm text-tertiary">
          {step === "email" ? (
            "Enter your email and we'll send you a 6-digit code. First time here? The same works for you."
          ) : (
            <>
              We sent a code to <span className="font-medium text-secondary">{email}</span>. It works for 10 minutes.
            </>
          )}
        </p>

        <form
          className="mt-6 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void (step === "email" ? sendCode() : verify());
          }}
        >
          {step === "email" ? (
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
            </Field>
          ) : (
            <Field label="Code">
              <Input
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="text-center font-mono text-xl tracking-[0.5em]"
                autoFocus
              />
            </Field>
          )}
          {error ? <p className="text-sm text-error-primary">{error}</p> : null}
          {devHint && step === "code" ? <p className="rounded-lg bg-secondary px-3 py-2 text-xs text-tertiary">Email isn't set up for this workspace yet, so the code is printed in the API's console.</p> : null}
          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy || (step === "email" ? !email : code.length !== 6)}>
            {step === "email" ? (
              <>
                <Mail /> {busy ? "Sending…" : "Email me a code"}
              </>
            ) : busy ? (
              "Checking…"
            ) : (
              "Sign in"
            )}
          </Button>
          {step === "code" ? (
            <div className="flex justify-between text-sm">
              <button type="button" className="flex items-center gap-1 text-tertiary hover:text-secondary" onClick={() => (setStep("email"), setCode(""), setError(null))}>
                <ArrowLeft className="size-4" /> Different email
              </button>
              <button type="button" className="font-semibold text-brand-secondary hover:underline" disabled={busy} onClick={() => void sendCode()}>
                Send a new code
              </button>
            </div>
          ) : null}
        </form>
      </div>
    </div>
  );
}
