import { Avatar, Card, EmptyState, cn } from "@hephaestus/ui";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Network } from "lucide-react";
import { useMemo, useState } from "react";
import { PageHeader } from "../../components/app-shell.tsx";
import { useOrgChart } from "../../lib/people.ts";
import { PageBody } from "./layout.tsx";

type Node = {
  id: string;
  fullName: string;
  jobTitle: string | null;
  managerId: string | null;
  departmentName: string | null;
  departmentColor: string | null;
  image: string | null;
};

function countDescendants(id: string, children: Map<string, Node[]>): number {
  return (children.get(id) ?? []).reduce((n, c) => n + 1 + countDescendants(c.id, children), 0);
}

function Person({ node, children, depth }: { node: Node; children: Map<string, Node[]>; depth: number }) {
  const kids = children.get(node.id) ?? [];
  const [open, setOpen] = useState(depth < 2);
  const total = useMemo(() => countDescendants(node.id, children), [node.id, children]);

  return (
    <li className="relative">
      <div className="flex items-center gap-2">
        <Link
          to="/people/$id"
          params={{ id: node.id }}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg border border-border bg-surface px-3 py-2.5 transition-colors hover:border-input sm:max-w-sm"
          style={{ borderLeft: `3px solid ${node.departmentColor ?? "var(--people)"}` }}
        >
          <Avatar name={node.fullName} src={node.image} />
          <div className="min-w-0">
            <div className="truncate text-sm font-medium">{node.fullName}</div>
            <div className="truncate text-xs text-muted-foreground">
              {[node.jobTitle, node.departmentName].filter(Boolean).join(" · ") || "—"}
            </div>
          </div>
        </Link>
        {kids.length ? (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1 rounded-md px-2 py-1 font-mono text-xs text-muted-foreground hover:bg-surface-2"
            aria-expanded={open}
            aria-label={`${open ? "Collapse" : "Expand"} ${node.fullName}'s team`}
          >
            {total}
            <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} />
          </button>
        ) : null}
      </div>
      {open && kids.length ? (
        <ul className="ml-5 mt-2 space-y-2 border-l border-border pl-5">
          {kids.map((k) => (
            <Person key={k.id} node={k} children={children} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function OrgChartPage() {
  const { data } = useOrgChart();
  const { roots, children } = useMemo(() => {
    const list = data?.employees ?? [];
    const ids = new Set(list.map((e) => e.id));
    const children = new Map<string, Node[]>();
    const roots: Node[] = [];
    for (const e of list) {
      if (e.managerId && ids.has(e.managerId)) {
        children.set(e.managerId, [...(children.get(e.managerId) ?? []), e]);
      } else {
        roots.push(e);
      }
    }
    // People with reports first, so leaders sit at the top.
    roots.sort((a, b) => countDescendants(b.id, children) - countDescendants(a.id, children));
    return { roots, children };
  }, [data]);

  return (
    <PageBody>
      <PageHeader title="Org chart" description="Who reports to whom. Set managers on each profile." />
      {data && roots.length === 0 ? (
        <Card>
          <EmptyState icon={<Network />} title="No one here yet" description="Add people to the directory and set their managers." />
        </Card>
      ) : (
        <ul className="space-y-3">
          {roots.map((r) => (
            <Person key={r.id} node={r} children={children} depth={0} />
          ))}
        </ul>
      )}
    </PageBody>
  );
}
