import { Badge, Button, Field, Input, Skeleton, Textarea } from "@operant/ui";
import { Link, useNavigate, useParams } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Clock, FileText, Send } from "lucide-react";
import { useState } from "react";
import { PageTitle, Section, useSlug } from "../components/shell.tsx";
import { api, type Service, useAction, useMe, useOrgPage } from "../lib/api.ts";

export function ServiceGrid({ services }: { services: Service[] }) {
  const slug = useSlug();
  if (!services.length) return <p className="rounded-2xl border border-dashed border-primary bg-primary px-6 py-12 text-center text-sm text-tertiary">No services are listed yet.</p>;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {services.map((s) => (
        <Link
          key={s.id}
          to="/$slug/services/$id"
          params={{ slug, id: s.id }}
          className="group flex flex-col rounded-2xl border border-secondary bg-primary p-5 shadow-xs transition hover:-translate-y-0.5 hover:border-primary hover:shadow-md"
        >
          {s.category ? <span className="text-xs font-semibold uppercase tracking-wide text-brand-secondary">{s.category}</span> : null}
          <h3 className="mt-1 text-md font-semibold text-primary">{s.name}</h3>
          {s.summary ? <p className="mt-1.5 line-clamp-3 text-sm text-tertiary">{s.summary}</p> : null}
          <div className="mt-auto flex items-end justify-between gap-2 pt-5">
            <div>
              <div className="text-sm font-semibold text-primary">{s.priceLabel}</div>
              {s.deliveryDays ? <div className="mt-0.5 text-xs text-tertiary">Usually {s.deliveryDays} day{s.deliveryDays === 1 ? "" : "s"}</div> : null}
            </div>
            <ArrowRight className="size-5 text-quaternary transition group-hover:translate-x-0.5 group-hover:text-brand-secondary" />
          </div>
        </Link>
      ))}
    </div>
  );
}

export function ServicesPage() {
  const slug = useSlug();
  const { data } = useOrgPage(slug);
  return (
    <div>
      <PageTitle
        title="Services"
        description="Choose what you need. Not sure? Send a general request and the team will help."
        actions={
          <Button asChild>
            <Link to="/$slug/services/$id" params={{ slug, id: "other" }}>
              Something else
            </Link>
          </Button>
        }
      />
      {data ? <ServiceGrid services={data.services} /> : <Skeleton className="h-64 rounded-2xl" />}
    </div>
  );
}

/** A service, and the short form to request it. "other" is a general request. */
export function ServicePage() {
  const slug = useSlug();
  const { id } = useParams({ strict: false }) as { id: string };
  const navigate = useNavigate();
  const { data } = useOrgPage(slug);
  const { data: me } = useMe(slug);
  const service = data?.services.find((s) => s.id === id);
  const general = id === "other";
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const firstTime = me && !me.company;

  const submit = useAction(
    () =>
      api<{ request: { id: string; label: string } }>(`portal/orgs/${slug}/requests`, {
        method: "POST",
        body: JSON.stringify({
          serviceId: general ? null : id,
          title: general ? title : null,
          details: details || null,
          name: me?.user.name ? null : name || null,
          phone: phone || null,
          companyName: company || null,
        }),
      }),
    { onSuccess: (r) => navigate({ to: "/$slug/requests/$id", params: { slug, id: r.request.id } }) },
  );

  if (!data) return <Skeleton className="h-96 rounded-2xl" />;
  if (!general && !service) {
    return (
      <p className="text-sm text-tertiary">
        This service isn't offered any more.{" "}
        <Link to="/$slug/services" params={{ slug }} className="font-semibold text-brand-secondary">
          See all services
        </Link>
      </p>
    );
  }

  const canSubmit = (general ? title.trim() : true) && (me?.user.name || name.trim());

  return (
    <div>
      <PageTitle
        back={
          <Link to="/$slug/services" params={{ slug }} className="mb-3 inline-flex items-center gap-1 text-sm text-tertiary hover:text-secondary">
            <ArrowLeft className="size-4" /> Services
          </Link>
        }
        title={general ? "Tell us what you need" : service!.name}
        description={general ? "Describe it in a few lines. The team will reply here." : service!.summary}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {service ? (
            <Section title="About this service">
              <div className="flex flex-wrap gap-2">
                <Badge tone="brand" pill>
                  {service.priceLabel}
                </Badge>
                {service.deliveryDays ? (
                  <Badge tone="neutral" pill>
                    <Clock className="size-3" /> Usually {service.deliveryDays} day{service.deliveryDays === 1 ? "" : "s"}
                  </Badge>
                ) : null}
              </div>
              {service.description ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-secondary">{service.description}</p> : null}
              {service.requiredDocs.length ? (
                <div className="mt-6">
                  <h3 className="text-sm font-semibold">You'll be asked for</h3>
                  <ul className="mt-2 space-y-2">
                    {service.requiredDocs.map((d) => (
                      <li key={d.name} className="flex gap-2 text-sm">
                        <FileText className="mt-0.5 size-4 shrink-0 text-quaternary" />
                        <span>
                          <span className="text-primary">{d.name}</span>
                          {d.hint ? <span className="text-tertiary"> · {d.hint}</span> : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-xs text-tertiary">You can upload these after sending the request.</p>
                </div>
              ) : null}
            </Section>
          ) : null}
        </div>

        <Section title={me ? "Request it" : "Sign in to request it"} className="h-fit lg:sticky lg:top-24">
          {!me ? (
            <div>
              <p className="text-sm text-tertiary">We'll email you a code to sign in. No password, and it takes a minute.</p>
              <Button variant="primary" className="mt-4 w-full" asChild>
                <Link to="/$slug/sign-in" params={{ slug }} search={{ next: `/${slug}/services/${id}` }}>
                  Sign in with email
                </Link>
              </Button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                if (canSubmit) submit.mutate(undefined);
              }}
            >
              {general ? (
                <Field label="What do you need?">
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="e.g. Help with an income tax notice" required />
                </Field>
              ) : null}
              <Field label="Details" hint="Anything that helps: deadlines, period, what's happened so far.">
                <Textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={5} maxLength={10_000} />
              </Field>
              {!me.user.name ? (
                <Field label="Your name">
                  <Input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
                </Field>
              ) : null}
              {firstTime ? (
                <>
                  <Field label="Company (optional)" hint="Leave blank if it's for you personally.">
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
                  </Field>
                  {!me.user.phone ? (
                    <Field label="Phone (optional)">
                      <Input value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
                    </Field>
                  ) : null}
                </>
              ) : null}
              <Button type="submit" variant="primary" size="lg" className="w-full" disabled={!canSubmit || submit.isPending}>
                <Send /> {submit.isPending ? "Sending…" : "Send request"}
              </Button>
              <p className="text-xs text-tertiary">No payment now. The team will confirm the details{service?.priceType === "quote" ? " and send you a quote" : ""}.</p>
            </form>
          )}
        </Section>
      </div>
    </div>
  );
}
