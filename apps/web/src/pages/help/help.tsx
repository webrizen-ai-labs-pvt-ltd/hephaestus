import { can } from "@operant/core";
import { Card, cn, FeaturedIcon, Input } from "@operant/ui";
import { Link, useNavigate, useParams, useRouterState } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, Search } from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useMemo, useState } from "react";
import type { Me } from "../../lib/api.ts";
import { useCrumb } from "../../lib/breadcrumbs.ts";
import { ARTICLES, type HelpArticle, sectionText } from "./content.tsx";

const GROUPS = ["Getting started", "Using Operant", "For admins"] as const;

/** Guides about areas the organization has switched off are hidden. */
function visibleArticles(me: Me) {
  const on = new Set(me.settings.enabledPillars);
  const hide: Record<string, boolean> = {
    people: !on.has("people"),
    work: !on.has("work"),
    collaboration: !on.has("collab"),
    "finance-setup": !on.has("finance"),
    invoicing: !on.has("finance"),
    "client-portal": !on.has("work"),
  };
  // In reading order: group by group, as listed.
  return ARTICLES.filter((a) => !hide[a.slug]).sort((x, y) => GROUPS.indexOf(x.group) - GROUPS.indexOf(y.group));
}

function HelpShell({ me, children, aside }: { me: Me; children: ReactNode; aside?: ReactNode }) {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const articles = visibleArticles(me);
  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 py-6 sm:px-8 sm:py-8 lg:grid-cols-[220px_1fr] xl:grid-cols-[220px_1fr_200px]">
      <nav aria-label="Guides" className="hidden lg:block">
        <div className="sticky top-24 space-y-5">
          <Link to="/help" className={cn("block rounded-lg px-3 py-2 text-sm font-semibold hover:bg-secondary", path === "/help" ? "bg-secondary text-primary" : "text-secondary")}>
            User manual
          </Link>
          {GROUPS.map((g) => (
            <div key={g}>
              <div className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-quaternary">{g}</div>
              {articles
                .filter((a) => a.group === g)
                .map((a) => {
                  const active = path === `/help/${a.slug}`;
                  return (
                    <Link
                      key={a.slug}
                      to="/help/$slug"
                      params={{ slug: a.slug }}
                      className={cn("flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm hover:bg-secondary", active ? "bg-secondary font-semibold text-primary" : "text-tertiary")}
                    >
                      <a.icon className="size-4 shrink-0" style={{ color: a.color }} />
                      {a.title}
                    </Link>
                  );
                })}
            </div>
          ))}
        </div>
      </nav>
      <div className={cn("min-w-0", !aside && "xl:col-span-2")}>{children}</div>
      {aside}
    </div>
  );
}

function GuideCard({ a }: { a: HelpArticle }) {
  return (
    <Link to="/help/$slug" params={{ slug: a.slug }} className="group flex gap-4 rounded-xl border border-secondary bg-primary p-4 shadow-xs transition hover:border-primary hover:shadow-md">
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary">
        <a.icon className="size-5" style={{ color: a.color }} />
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1 font-semibold text-primary">
          {a.title} <ArrowRight className="size-4 text-quaternary transition group-hover:translate-x-0.5" />
        </span>
        <span className="mt-0.5 block text-sm text-tertiary">{a.summary}</span>
      </span>
    </Link>
  );
}

/** The manual's front page: where to start, every guide, and search. */
export function HelpPage({ me }: { me: Me }) {
  const [q, setQ] = useState("");
  const query = useDeferredValue(q.trim().toLowerCase());
  const articles = visibleArticles(me);
  const isAdmin = can(me.org.permissions, "settings", "manage");

  // Every section, as plain text, so search finds words inside the guides too.
  const index = useMemo(
    () =>
      articles.flatMap((a) =>
        a.sections.map((s) => ({ a, s, title: `${s.title} ${s.keywords ?? ""}`.toLowerCase(), text: `${a.title} ${s.title} ${s.keywords ?? ""} ${sectionText(s.body)}`.toLowerCase() })),
      ),
    [articles],
  );
  const words = query.split(/\s+/).filter(Boolean);
  // Sections whose title or keywords match come first.
  const results = words.length
    ? index
        .filter((r) => words.every((w) => r.text.includes(w)))
        .sort((x, y) => Number(words.every((w) => y.title.includes(w))) - Number(words.every((w) => x.title.includes(w))))
        .slice(0, 20)
    : [];

  return (
    <HelpShell me={me}>
      <div className="rounded-2xl border border-secondary bg-primary p-6 shadow-xs sm:p-8">
        <p className="eyebrow text-brand-secondary">User manual</p>
        <h1 className="mt-2 text-display-xs font-semibold text-primary sm:text-display-sm">How to use Operant</h1>
        <p className="mt-2 max-w-2xl text-md text-tertiary">Short guides for every part of Operant. New here? Start with the first one.</p>
        <div className="relative mt-6 max-w-xl">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-5 -translate-y-1/2 text-quaternary" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the manual, e.g. leave, GST, instalments" className="h-11 pl-11" aria-label="Search the manual" autoFocus />
        </div>
      </div>

      {words.length ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-tertiary">
            {results.length ? `${results.length} result${results.length === 1 ? "" : "s"}` : "Nothing matches that. Try another word."}
          </h2>
          <ul className="space-y-2">
            {results.map(({ a, s }) => (
              <li key={`${a.slug}-${s.id}`}>
                <Link to="/help/$slug" params={{ slug: a.slug }} hash={s.id} className="flex items-center gap-3 rounded-xl border border-secondary bg-primary p-4 hover:bg-secondary">
                  <a.icon className="size-5 shrink-0" style={{ color: a.color }} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-semibold text-primary">{s.title}</span>
                    <span className="block text-sm text-tertiary">{a.title}</span>
                  </span>
                  <ArrowRight className="size-4 text-quaternary" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <Link
            to="/help/$slug"
            params={{ slug: "start-here" }}
            hash={isAdmin ? "first-steps-admin" : "first-steps-member"}
            className="mt-6 flex flex-col gap-4 rounded-2xl bg-brand-solid p-6 text-white shadow-md transition hover:opacity-95 sm:flex-row sm:items-center"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-lg font-semibold">Start here</span>
              <span className="mt-1 block text-sm text-white/85">
                {isAdmin ? "Setting Operant up for your organization? Six steps, about half an hour." : "Just joined? Five things to do on your first day."}
              </span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-sm font-semibold ring-1 ring-white/25">
              Open the guide <ArrowRight className="size-4" />
            </span>
          </Link>

          {GROUPS.map((g) => {
            const list = articles.filter((a) => a.group === g && a.slug !== "start-here");
            if (!list.length) return null;
            return (
              <section key={g} className="mt-8">
                <h2 className="mb-3 text-lg font-semibold">{g}</h2>
                <div className="grid gap-3 md:grid-cols-2">
                  {list.map((a) => (
                    <GuideCard key={a.slug} a={a} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </HelpShell>
  );
}

export function HelpArticlePage({ me }: { me: Me }) {
  const { slug } = useParams({ strict: false }) as { slug: string };
  const navigate = useNavigate();
  const hash = useRouterState({ select: (s) => s.location.hash });
  const articles = visibleArticles(me);
  const i = articles.findIndex((a) => a.slug === slug);
  const a = articles[i];
  useCrumb(a?.title ?? null);

  // Scroll to the section in the link, once it's on the page.
  useEffect(() => {
    if (!a) return;
    if (hash) document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    else window.scrollTo({ top: 0 });
  }, [a, hash]);

  if (!a) {
    return (
      <HelpShell me={me}>
        <Card className="p-8 text-center">
          <h1 className="text-xl font-semibold">That guide doesn't exist</h1>
          <Link to="/help" className="mt-3 inline-block font-semibold text-brand-secondary">
            Back to the user manual
          </Link>
        </Card>
      </HelpShell>
    );
  }
  const prev = articles[i - 1];
  const next = articles[i + 1];

  return (
    <HelpShell
      me={me}
      aside={
        <aside className="hidden xl:block">
          <div className="sticky top-24">
            <div className="pb-2 text-xs font-semibold uppercase tracking-wide text-quaternary">On this page</div>
            <ul className="space-y-1 border-l border-secondary">
              {a.sections.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => navigate({ to: "/help/$slug", params: { slug }, hash: s.id, replace: true })}
                    className={cn("-ml-px block border-l-2 py-1 pl-3 text-left text-sm hover:text-primary", hash === s.id ? "border-brand-solid font-medium text-primary" : "border-transparent text-tertiary")}
                  >
                    {s.title}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      }
    >
      <Link to="/help" className="inline-flex items-center gap-1 text-sm text-tertiary hover:text-primary lg:hidden">
        <ArrowLeft className="size-4" /> User manual
      </Link>
      <article className="mt-2 lg:mt-0">
        <header className="flex items-start gap-4">
          <FeaturedIcon icon={a.icon} color="gray" theme="modern" size="lg" />
          <div>
            <p className="text-sm font-medium text-tertiary">{a.group}</p>
            <h1 className="text-display-xs font-semibold text-primary">{a.title}</h1>
            <p className="mt-1 max-w-2xl text-md text-tertiary">{a.summary}</p>
          </div>
        </header>
        <div className="mt-8 max-w-3xl space-y-10 text-md leading-relaxed text-secondary">
          {a.sections.map((s) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-xl font-semibold text-primary">{s.title}</h2>
              {s.body}
            </section>
          ))}
        </div>
        <nav className="mt-12 grid max-w-3xl gap-3 border-t border-secondary pt-6 sm:grid-cols-2" aria-label="More guides">
          {prev ? (
            <Link to="/help/$slug" params={{ slug: prev.slug }} className="rounded-xl border border-secondary p-4 hover:bg-secondary">
              <span className="text-xs text-tertiary">Previous</span>
              <span className="mt-0.5 flex items-center gap-1 font-semibold text-primary">
                <ArrowLeft className="size-4" /> {prev.title}
              </span>
            </Link>
          ) : (
            <span />
          )}
          {next ? (
            <Link to="/help/$slug" params={{ slug: next.slug }} className="rounded-xl border border-secondary p-4 text-right hover:bg-secondary">
              <span className="text-xs text-tertiary">Next</span>
              <span className="mt-0.5 flex items-center justify-end gap-1 font-semibold text-primary">
                {next.title} <ArrowRight className="size-4" />
              </span>
            </Link>
          ) : null}
        </nav>
      </article>
    </HelpShell>
  );
}
