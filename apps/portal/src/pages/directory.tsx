import { Badge, Input, Logo, Skeleton } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Search } from "lucide-react";
import { useDeferredValue, useState } from "react";
import { OrgMark } from "../components/shell.tsx";
import { useDirectory } from "../lib/api.ts";

/** The public front door: firms that chose to be listed, and what they offer. */
export function DirectoryPage() {
  const [q, setQ] = useState("");
  const deferred = useDeferredValue(q.trim());
  const { data, isLoading } = useDirectory(deferred);

  return (
    <div className="min-h-dvh bg-secondary">
      <header className="border-b border-secondary bg-primary">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-4 sm:px-6">
          <Logo className="size-7 text-brand-secondary" />
          <span className="font-semibold">Client portal</span>
        </div>
      </header>
      <section className="border-b border-secondary bg-primary">
        <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
          <h1 className="max-w-2xl text-display-md font-semibold tracking-tight text-primary">Work with the firms you trust, all in one place</h1>
          <p className="mt-4 max-w-xl text-lg text-tertiary">Request a service, share documents securely, talk to the team and follow progress. Sign in with your email, no password needed.</p>
          <div className="relative mt-8 max-w-lg">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-quaternary" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search firms or services, e.g. GST, audit" className="h-12 pl-11 text-md" aria-label="Search firms or services" />
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-48 rounded-2xl" />
            ))}
          </div>
        ) : data?.orgs.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.orgs.map((o) => (
              <Link
                key={o.id}
                to="/$slug"
                params={{ slug: o.slug }}
                className="group flex flex-col rounded-2xl border border-secondary bg-primary p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
              >
                <div className="flex items-center gap-3">
                  <OrgMark name={o.name} logo={o.logo} className="size-12" />
                  <div className="min-w-0">
                    <div className="truncate text-md font-semibold text-primary">{o.name}</div>
                    <div className="text-xs text-tertiary">
                      {o.services} service{o.services === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
                {o.tagline ? <p className="mt-3 line-clamp-2 text-sm text-tertiary">{o.tagline}</p> : null}
                <div className="mt-4 flex flex-wrap gap-1.5">
                  {o.names.map((n) => (
                    <Badge key={n} tone="neutral">
                      {n}
                    </Badge>
                  ))}
                </div>
                <span className="mt-auto flex items-center gap-1 pt-5 text-sm font-semibold text-brand-secondary">
                  View services <ArrowRight className="size-4 transition group-hover:translate-x-0.5" />
                </span>
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-primary bg-primary px-6 py-16 text-center">
            <h2 className="text-lg font-semibold">{deferred ? "No firms match that search" : "No firms are listed yet"}</h2>
            <p className="mt-1 text-sm text-tertiary">If a firm sent you a link to their portal, open it directly.</p>
          </div>
        )}
      </main>
    </div>
  );
}
