import { can } from "@hephaestus/core";
import { Avatar, Button, cn, Dialog, DialogContent, Field, Input, Select, Textarea } from "@hephaestus/ui";
import { Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { AtSign, Gavel, Hash, Lock, Plus, Search } from "lucide-react";
import { useState } from "react";
import { api, type Me } from "../../lib/api.ts";
import { type ChannelSummary, COLLAB_KEYS, useChannels, useMembers } from "../../lib/collab.ts";
import { useApiMutation } from "../../lib/people.ts";

function NewChannelDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const navigate = useNavigate();
  const { data } = useMembers();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [kind, setKind] = useState<"public" | "private">("public");
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const create = useApiMutation(
    () => api<{ channel: { id: string } }>("collab/channels", { method: "POST", body: JSON.stringify({ name, description: description || null, kind, memberIds }) }),
    {
      invalidate: COLLAB_KEYS,
      onSuccess: (r) => {
        onOpenChange(false);
        navigate({ to: "/collab/c/$id", params: { id: r.channel.id } });
      },
    },
  );
  const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-_]/g, "");
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New channel"
        description="Channels are for topics, teams or clients."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={create.isPending} onClick={() => (slug ? create.mutate(undefined) : setError("Enter a name"))}>
              Create
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <Field label="Name" error={error} hint={slug ? `#${slug}` : "Lowercase, no spaces"}>
            <Input value={name} onChange={(e) => (setName(e.target.value), setError(null))} placeholder="client-acme" autoFocus maxLength={40} />
          </Field>
          <Field label="What's it about?">
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={300} className="min-h-14" />
          </Field>
          <Field label="Who can join">
            <Select value={kind} onChange={(e) => setKind(e.target.value as "public" | "private")}>
              <option value="public">Anyone in the organization</option>
              <option value="private">Only people I add</option>
            </Select>
          </Field>
          {kind === "private" ? (
            <div>
              <div className="mb-1.5 text-sm font-medium">Members</div>
              <ul className="max-h-48 overflow-y-auto rounded-lg border border-border">
                {data?.members.map((m) => (
                  <li key={m.id}>
                    <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-surface-2">
                      <input
                        type="checkbox"
                        checked={memberIds.includes(m.id)}
                        onChange={() => setMemberIds((l) => (l.includes(m.id) ? l.filter((x) => x !== m.id) : [...l, m.id]))}
                        className="accent-[var(--primary)]"
                      />
                      <Avatar name={m.name} src={m.image} className="size-6 text-[10px]" />
                      {m.name}
                    </label>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewDmDialog({ open, onOpenChange, meId }: { open: boolean; onOpenChange: (o: boolean) => void; meId?: string }) {
  const navigate = useNavigate();
  const { data } = useMembers();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<string[]>([]);
  const start = useApiMutation(() => api<{ channel: { id: string } }>("collab/dms", { method: "POST", body: JSON.stringify({ memberIds: picked }) }), {
    invalidate: COLLAB_KEYS,
    onSuccess: (r) => {
      onOpenChange(false);
      navigate({ to: "/collab/c/$id", params: { id: r.channel.id } });
    },
  });
  const people = (data?.members ?? []).filter((m) => m.id !== meId && m.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="New message"
        description="Pick one person, or a few for a small group."
        footer={
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button variant="primary" disabled={!picked.length || start.isPending} onClick={() => start.mutate(undefined)}>
              Start conversation
            </Button>
          </>
        }
      >
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people" className="pl-9" autoFocus />
        </div>
        <ul className="max-h-72 overflow-y-auto">
          {people.map((m) => {
            const on = picked.includes(m.id);
            return (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setPicked((l) => (on ? l.filter((x) => x !== m.id) : [...l, m.id].slice(0, 8)))}
                  className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-2", on && "bg-surface-2")}
                >
                  <Avatar name={m.name} src={m.image} className="size-8" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{m.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{m.email}</div>
                  </div>
                  <span className={cn("size-4 rounded-full border-2", on ? "border-primary bg-primary" : "border-input")} />
                </button>
              </li>
            );
          })}
          {data && people.length === 0 ? <li className="px-3 py-6 text-center text-sm text-muted-foreground">No one else has signed in yet.</li> : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

function ChannelLink({ c, active }: { c: ChannelSummary; active: boolean }) {
  const icon =
    c.kind === "dm" ? (
      <Avatar name={c.name ?? "?"} src={c.people[0]?.image} className="size-5 text-[9px]" />
    ) : c.kind === "private" ? (
      <Lock className="size-4" />
    ) : (
      <Hash className="size-4" />
    );
  return (
    <Link
      to="/collab/c/$id"
      params={{ id: c.id }}
      className={cn(
        "flex h-8 items-center gap-2 rounded-md px-2 text-sm",
        active ? "bg-surface-2 font-medium text-foreground" : c.unread ? "font-semibold text-foreground hover:bg-surface-2/60" : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground",
      )}
    >
      <span className="flex w-5 shrink-0 justify-center text-muted-foreground">{icon}</span>
      <span className="truncate">{c.name}</span>
      {c.mentions ? (
        <span className="ml-auto rounded-full bg-primary px-1.5 font-mono text-[10px] text-primary-foreground">{c.mentions}</span>
      ) : c.unread ? (
        <span className="ml-auto size-2 rounded-full bg-collab" />
      ) : null}
    </Link>
  );
}

export function CollabLayout({ me }: { me: Me }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { data } = useChannels();
  const [newChannel, setNewChannel] = useState(false);
  const [newDm, setNewDm] = useState(false);
  const navigate = useNavigate();
  const canCreate = can(me.org.permissions, "channel", "create");
  const channels = (data?.channels ?? []).filter((c) => c.kind !== "dm").sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
  const dms = (data?.channels ?? []).filter((c) => c.kind === "dm");
  const inChannel = pathname.startsWith("/collab/c/") || pathname === "/collab/mentions" || pathname === "/collab/decisions";

  return (
    <div className="flex h-[calc(100dvh-3.5rem)]">
      <aside className={cn("w-full shrink-0 flex-col overflow-y-auto border-r border-border bg-sidebar/40 p-3 md:flex md:w-64", inChannel ? "hidden" : "flex")}>
        <div className="flex items-center gap-2 px-2 pb-3 pt-1">
          <span className="size-2 rounded-full bg-collab" />
          <span className="font-display text-sm font-bold">Collaboration</span>
        </div>
        <Link
          to="/collab/mentions"
          className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-sm", pathname === "/collab/mentions" ? "bg-surface-2 font-medium" : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground")}
        >
          <AtSign className="size-4" /> Mentions
        </Link>
        <Link
          to="/collab/decisions"
          className={cn("flex h-8 items-center gap-2 rounded-md px-2 text-sm", pathname === "/collab/decisions" ? "bg-surface-2 font-medium" : "text-muted-foreground hover:bg-surface-2/60 hover:text-foreground")}
        >
          <Gavel className="size-4" /> Decisions
        </Link>

        <div className="mt-5 flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Channels</span>
          {canCreate ? (
            <button type="button" aria-label="New channel" onClick={() => setNewChannel(true)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
              <Plus className="size-4" />
            </button>
          ) : null}
        </div>
        {channels.map((c) => (
          <ChannelLink key={c.id} c={c} active={pathname === `/collab/c/${c.id}`} />
        ))}
        {data?.browse.length ? (
          <Select
            value=""
            onChange={async (e) => {
              const id = e.target.value;
              if (!id) return;
              await api(`collab/channels/${id}/join`, { method: "POST" });
              navigate({ to: "/collab/c/$id", params: { id } });
            }}
            className="mt-1 h-8 border-dashed text-xs text-muted-foreground"
            aria-label="Join a channel"
          >
            <option value="">Join a channel ({data.browse.length})</option>
            {data.browse.map((b) => (
              <option key={b.id} value={b.id}>
                #{b.name}
              </option>
            ))}
          </Select>
        ) : null}

        <div className="mt-5 flex items-center justify-between px-2 pb-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">Direct messages</span>
          <button type="button" aria-label="New direct message" onClick={() => setNewDm(true)} className="rounded p-0.5 text-muted-foreground hover:text-foreground">
            <Plus className="size-4" />
          </button>
        </div>
        {dms.map((c) => (
          <ChannelLink key={c.id} c={c} active={pathname === `/collab/c/${c.id}`} />
        ))}
        {data && dms.length === 0 ? <p className="px-2 py-1 text-xs text-muted-foreground">No conversations yet.</p> : null}
      </aside>

      <section className={cn("min-w-0 flex-1 flex-col", inChannel ? "flex" : "hidden md:flex")}>
        <Outlet />
      </section>

      {newChannel ? <NewChannelDialog open onOpenChange={setNewChannel} /> : null}
      {newDm ? <NewDmDialog open onOpenChange={setNewDm} meId={data?.me} /> : null}
    </div>
  );
}
