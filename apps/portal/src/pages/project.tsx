import { Avatar, Badge, Meter, Skeleton } from "@operant/ui";
import { Link, useParams } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, Circle } from "lucide-react";
import { Checklist, Conversation, FileChip } from "../components/conversation.tsx";
import { PageTitle, Section, SignedIn, useSlug } from "../components/shell.tsx";
import { longDate, useDocuments, useProject } from "../lib/api.ts";

export function ProjectPage() {
  return (
    <SignedIn>
      <ProjectView />
    </SignedIn>
  );
}

function ProjectView() {
  const slug = useSlug();
  const { id } = useParams({ strict: false }) as { id: string };
  const { data, error } = useProject(slug, id);
  if (error) return <p className="text-sm text-tertiary">{error.message}</p>;
  if (!data) return <Skeleton className="h-[600px] rounded-2xl" />;
  const p = data.project;
  const pct = p.total ? Math.round((p.done / p.total) * 100) : 0;

  return (
    <div>
      <PageTitle
        back={
          <Link to="/$slug" params={{ slug }} className="mb-3 inline-flex items-center gap-1 text-sm text-tertiary hover:text-secondary">
            <ArrowLeft className="size-4" /> Home
          </Link>
        }
        title={p.name}
        description={p.description ?? undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-6">
          <Section title="Progress" action={<Badge tone={p.status === "completed" ? "people" : "collab"} pill>{p.status === "completed" ? "Completed" : p.status === "on_hold" ? "On hold" : "In progress"}</Badge>}>
            <div className="flex items-end justify-between">
              <span className="font-display text-display-sm font-semibold">{pct}%</span>
              <span className="text-sm text-tertiary">
                {p.done} of {p.total} steps done{p.dueDate ? ` · due ${longDate(p.dueDate)}` : ""}
              </span>
            </div>
            <Meter value={p.done} max={Math.max(1, p.total)} className="mt-3 h-2" label="Progress" />
            {data.milestones.length ? (
              <ol className="mt-6 space-y-3">
                {data.milestones.map((m) => (
                  <li key={m.id} className="flex items-center gap-3 text-sm">
                    {m.completedAt ? <CheckCircle2 className="size-5 text-fg-success-primary" /> : <Circle className="size-5 text-quaternary" />}
                    <span className={m.completedAt ? "text-tertiary line-through" : "font-medium text-primary"}>{m.name}</span>
                    <span className="ml-auto text-xs text-tertiary">{m.completedAt ? `Done ${longDate(m.completedAt)}` : m.dueDate ? longDate(m.dueDate) : ""}</span>
                  </li>
                ))}
              </ol>
            ) : null}
          </Section>

          <Section title="Conversation">
            <Conversation slug={slug} messages={data.messages} postPath={`portal/orgs/${slug}/projects/${id}/messages`} />
          </Section>
        </div>

        <div className="space-y-6">
          {data.team.length ? (
            <Section title="Your team">
              <ul className="space-y-3">
                {data.team.map((t) => (
                  <li key={t.name} className="flex items-center gap-3">
                    <Avatar name={t.name} src={t.image} className="size-10" />
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-primary">
                        {t.name}
                        {t.lead ? (
                          <Badge tone="brand" className="ml-2">
                            Lead
                          </Badge>
                        ) : null}
                      </div>
                      {t.jobTitle ? <div className="truncate text-xs text-tertiary">{t.jobTitle}</div> : null}
                    </div>
                  </li>
                ))}
              </ul>
            </Section>
          ) : null}
          <Section title="Documents">
            <Checklist slug={slug} items={data.documents} />
          </Section>
        </div>
      </div>
    </div>
  );
}

export function DocumentsPage() {
  const slug = useSlug();
  const { data } = useDocuments(slug);
  return (
    <SignedIn>
      <PageTitle title="Documents" description="Everything you've shared with the team, and what they've shared with you." />
      {!data ? (
        <Skeleton className="h-64 rounded-2xl" />
      ) : data.groups.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-primary bg-primary px-6 py-12 text-center text-sm text-tertiary">No documents yet.</p>
      ) : (
        <div className="space-y-6">
          {data.groups.map((g) => (
            <Section
              key={g.id}
              title={
                <Link to={g.kind === "project" ? "/$slug/projects/$id" : "/$slug/requests/$id"} params={{ slug, id: g.id }} className="hover:underline">
                  {g.title}
                </Link>
              }
            >
              {g.documents.length ? <Checklist slug={slug} items={g.documents} /> : null}
              {g.shared.length ? (
                <div className={g.documents.length ? "mt-5 border-t border-secondary pt-5" : ""}>
                  <h3 className="mb-2 text-sm font-semibold">Shared in the conversation</h3>
                  <div className="flex flex-wrap gap-2">
                    {g.shared.map((f) => (
                      <FileChip key={f.id} slug={slug} file={f} />
                    ))}
                  </div>
                </div>
              ) : null}
            </Section>
          ))}
        </div>
      )}
    </SignedIn>
  );
}
