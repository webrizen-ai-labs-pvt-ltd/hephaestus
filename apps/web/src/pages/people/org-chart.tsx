import { Avatar, Card, cn, Em, EmptyState } from "@hephaestus/ui";
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

function depthOf(id: string, children: Map<string, Node[]>): number {
  const kids = children.get(id) ?? [];
  return kids.length ? 1 + Math.max(...kids.map((k) => depthOf(k.id, children))) : 1;
}

function PersonCard({ node }: { node: Node }) {
  const color = node.departmentColor ?? "var(--people)";
  return (
    <Link
      to="/people/$id"
      params={{ id: node.id }}
      className="relative flex w-48 flex-col items-center overflow-hidden rounded-xl border border-secondary bg-primary px-3 pb-3 pt-4 text-center shadow-xs transition-all hover:-translate-y-0.5 hover:border-primary"
    >
      <span className="absolute inset-x-0 top-0 h-1" style={{ background: color }} />
      <Avatar name={node.fullName} src={node.image} className="size-11" />
      <div className="mt-2 w-full truncate text-[13px] font-semibold">{node.fullName}</div>
      <div className="w-full truncate text-[11.5px] text-tertiary">{node.jobTitle ?? "—"}</div>
      {node.departmentName ? (
        <span className="mt-2 inline-flex max-w-full items-center gap-1.5 truncate rounded-full px-2 py-0.5 text-[10.5px]" style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
          {node.departmentName}
        </span>
      ) : null}
    </Link>
  );
}

function Branch({ node, children, depth }: { node: Node; children: Map<string, Node[]>; depth: number }) {
  const kids = children.get(node.id) ?? [];
  const [open, setOpen] = useState(depth < 3);
  const total = useMemo(() => countDescendants(node.id, children), [node.id, children]);
  const allLeaves = kids.every((k) => !(children.get(k.id) ?? []).length);

  return (
    <li>
      <PersonCard node={node} />
      {kids.length ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="relative z-[1] -mt-2.5 flex items-center gap-1 rounded-full border border-secondary bg-secondary px-2 py-0.5 font-mono text-[10.5px] text-tertiary shadow-xs hover:text-primary"
          aria-expanded={open}
          aria-label={`${open ? "Collapse" : "Expand"} ${node.fullName}'s team`}
        >
          {total}
          <ChevronDown className={cn("size-3 transition-transform", !open && "-rotate-90")} />
        </button>
      ) : null}
      {open && kids.length ? (
        <ul className={cn(allLeaves && kids.length > 1 && "org-stack")}>
          {kids.map((k) => (
            <Branch key={k.id} node={k} children={children} depth={depth + 1} />
          ))}
        </ul>
      ) : null}
    </li>
  );
}

export function OrgChartPage() {
  const { data } = useOrgChart();
  const { roots, children, stats, depts } = useMemo(() => {
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
    const managers = children.size;
    const levels = roots.length ? Math.max(...roots.map((r) => depthOf(r.id, children))) : 0;
    const span = managers ? [...children.values()].reduce((a, k) => a + k.length, 0) / managers : 0;
    const depts = new Map<string, string>();
    for (const e of list) if (e.departmentName) depts.set(e.departmentName, e.departmentColor ?? "var(--people)");
    return { roots, children, stats: { managers, levels, span }, depts };
  }, [data]);

  return (
    <PageBody className="max-w-none">
      <PageHeader
        title="Org chart"
        description={
          data && roots.length ? (
            <>
              <Em tone="var(--people)">{stats.levels} levels</Em>, <Em>{stats.managers} managers</Em>, about <Em>{stats.span.toFixed(1)}</Em> direct reports each. Set managers on each profile.
            </>
          ) : (
            "Who reports to whom. Set managers on each profile."
          )
        }
      />
      {depts.size ? (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-tertiary">
          {[...depts].map(([name, color]) => (
            <span key={name} className="inline-flex items-center gap-1.5">
              <span className="size-2.5 rounded-sm" style={{ background: color }} />
              {name}
            </span>
          ))}
        </div>
      ) : null}
      {data && roots.length === 0 ? (
        <Card>
          <EmptyState icon={<Network />} title="No one here yet" description="Add people to the directory and set their managers." />
        </Card>
      ) : (
        <Card className="rise rise-1 overflow-x-auto bg-[radial-gradient(var(--color-border-secondary)_1px,transparent_1px)] p-8 [background-size:18px_18px]">
          <div className="org-tree mx-auto w-max">
            <ul>
              {roots.map((r) => (
                <Branch key={r.id} node={r} children={children} depth={0} />
              ))}
            </ul>
          </div>
        </Card>
      )}
    </PageBody>
  );
}
