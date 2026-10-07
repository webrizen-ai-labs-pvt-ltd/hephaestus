import { Badge, Button, FeaturedIcon, Meter, Skeleton } from "@operant/ui";
import { Link } from "@tanstack/react-router";
import { ArrowRight, FileText, FolderKanban, MessageSquare, ReceiptText, Send, Upload } from "lucide-react";
import { OrgMark, PageTitle, Section, useSlug } from "../components/shell.tsx";
import { longDate, money, STATUS, useHome, useMe, useOrgPage } from "../lib/api.ts";
import { ServiceGrid } from "./services.tsx";

/** "/requests/<id>" → a typed link inside this portal. */
function attentionLink(slug: string, path: string) {
  const [, kind, id] = path.split("/");
  if (kind === "requests" && id) return { to: "/$slug/requests/$id" as const, params: { slug, id } };
  if (kind === "projects" && id) return { to: "/$slug/projects/$id" as const, params: { slug, id } };
  return { to: "/$slug/billing" as const, params: { slug } };
}

const ATTENTION_ICON = { quote: FileText, documents: Upload, message: MessageSquare, invoice: ReceiptText } as const;

/** Signed out: what the firm offers. Signed in: what's going on and what needs the client. */
export function OrgHomePage() {
  const slug = useSlug();
  const { data: me, isLoading } = useMe(slug);
  if (isLoading) return <Skeleton className="h-96 w-full rounded-2xl" />;
  return me ? <Dashboard /> : <Landing />;
}

function Landing() {
  const slug = useSlug();
  const { data } = useOrgPage(slug);
  if (!data) return <Skeleton className="h-96 w-full rounded-2xl" />;
  return (
    <div className="space-y-10">
      <section className="overflow-hidden rounded-3xl border border-secondary bg-primary p-6 shadow-xs sm:p-10">
        <OrgMark name={data.org.name} logo={data.org.logo} className="size-14 text-lg" />
        <h1 className="mt-6 max-w-2xl text-display-sm font-semibold tracking-tight">{data.org.name}</h1>
        <p className="mt-3 max-w-2xl text-lg text-tertiary">{data.org.tagline ?? "Request a service, share documents and follow the work, all in one place."}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Button variant="primary" size="lg" asChild>
            <Link to="/$slug/sign-in" params={{ slug }}>
              Sign in with email
            </Link>
          </Button>
          <Button size="lg" asChild>
            <a href="#services">See services</a>
          </Button>
        </div>
        <ol className="mt-10 grid gap-4 border-t border-secondary pt-8 sm:grid-cols-3">
          {[
            ["Request a service", "Pick what you need and tell us a little about it."],
            ["Share and discuss", "Upload documents securely and talk to the team that's working with you."],
            ["Follow the work", "See progress, approve quotes and pay invoices online."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-brand-secondary text-sm font-semibold text-brand-secondary">{i + 1}</span>
              <div>
                <div className="font-semibold text-primary">{t}</div>
                <p className="mt-0.5 text-sm text-tertiary">{d}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>
      <div id="services">
        <h2 className="mb-4 text-xl font-semibold">Services</h2>
        <ServiceGrid services={data.services} />
      </div>
    </div>
  );
}

function Dashboard() {
  const slug = useSlug();
  const { data: me } = useMe(slug);
  const { data } = useHome(slug);
  const first = me?.user.name?.split(" ")[0];

  return (
    <div>
      <PageTitle
        title={`Welcome${first ? `, ${first}` : ""}`}
        description="Here's where things stand."
        actions={
          <Button variant="primary" asChild>
            <Link to="/$slug/services" params={{ slug }}>
              <Send /> Request a service
            </Link>
          </Button>
        }
      />
      {!data ? (
        <Skeleton className="h-96 w-full rounded-2xl" />
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Section title="Needs your attention">
              {data.attention.length === 0 ? (
                <p className="text-sm text-tertiary">You're all caught up.</p>
              ) : (
                <ul className="space-y-2">
                  {data.attention.map((a, i) => (
                    <li key={i}>
                      <Link {...attentionLink(slug, a.path)} className="flex items-center gap-3 rounded-xl border border-secondary p-3 hover:bg-secondary">
                        <FeaturedIcon icon={ATTENTION_ICON[a.kind]} color={a.kind === "invoice" ? "warning" : a.kind === "documents" ? "brand" : "gray"} theme="light" size="md" />
                        <span className="min-w-0 flex-1 text-sm font-medium text-primary">{a.title}</span>
                        {a.kind === "invoice" && a.detail ? <span className="font-mono text-sm">{money(Number(a.detail), data.due.currency)}</span> : null}
                        <ArrowRight className="size-4 text-quaternary" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Your work" action={<FolderKanban className="size-5 text-quaternary" />}>
              {data.projects.length === 0 ? (
                <p className="text-sm text-tertiary">Once the team starts work on a request, you'll follow it here.</p>
              ) : (
                <ul className="divide-y divide-border-secondary">
                  {data.projects.map((p) => (
                    <li key={p.id}>
                      <Link to="/$slug/projects/$id" params={{ slug, id: p.id }} className="flex items-center gap-4 py-3 hover:opacity-80">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="truncate font-medium text-primary">{p.name}</span>
                            {p.unread ? <Badge tone="brand">{p.unread} new</Badge> : null}
                          </div>
                          <div className="mt-2 flex items-center gap-3">
                            <Meter value={p.done} max={Math.max(1, p.total)} className="max-w-48 flex-1" label="Progress" />
                            <span className="text-xs text-tertiary">{p.total ? `${Math.round((p.done / p.total) * 100)}%` : "Starting"}</span>
                          </div>
                        </div>
                        {p.dueDate ? <span className="hidden text-xs text-tertiary sm:block">Due {longDate(p.dueDate)}</span> : null}
                        <ArrowRight className="size-4 text-quaternary" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>
          </div>

          <div className="space-y-6">
            <Section title="Requests">
              {data.requests.length === 0 ? (
                <div className="text-sm text-tertiary">
                  No requests yet.{" "}
                  <Link to="/$slug/services" params={{ slug }} className="font-semibold text-brand-secondary hover:underline">
                    Browse services
                  </Link>
                </div>
              ) : (
                <ul className="space-y-1">
                  {data.requests.map((r) => (
                    <li key={r.id}>
                      <Link
                        to={r.projectId ? "/$slug/projects/$id" : "/$slug/requests/$id"}
                        params={{ slug, id: r.projectId ?? r.id }}
                        className="flex items-center gap-3 rounded-lg p-2 hover:bg-secondary"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium text-primary">{r.title}</div>
                          <div className="text-xs text-tertiary">
                            {r.label} · {longDate(r.updatedAt)}
                          </div>
                        </div>
                        {r.unread ? <span className="size-2 rounded-full bg-brand-solid" aria-label="New messages" /> : null}
                        <Badge tone={STATUS[r.status].tone} pill>
                          {STATUS[r.status].label}
                        </Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Section>

            <Section title="Billing">
              <div className="text-sm text-tertiary">{data.due.count ? `${data.due.count} invoice${data.due.count === 1 ? "" : "s"} to pay` : "Nothing to pay right now"}</div>
              <div className="mt-1 font-mono text-display-xs font-semibold">{money(data.due.amount, data.due.currency)}</div>
              <Button className="mt-4 w-full" asChild>
                <Link to="/$slug/billing" params={{ slug }}>
                  View invoices
                </Link>
              </Button>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}
