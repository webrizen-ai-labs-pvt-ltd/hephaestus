import { MENTION_RE, QUICK_REACTIONS } from "@hephaestus/core";
import { Avatar, cn, Popover, PopoverContent, PopoverTrigger } from "@hephaestus/ui";
import { FileText, Gavel, Pencil, SmilePlus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api.ts";
import { COLLAB_KEYS, type Message } from "../../lib/collab.ts";
import { useApiMutation } from "../../lib/people.ts";
import { Composer } from "./composer.tsx";
import { MessageBody } from "./message-body.tsx";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

function formatBytes(n: number) {
  return n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`;
}

function MessageItem({ m, meId, grouped, canModerate }: { m: Message; meId?: string; grouped: boolean; canModerate: boolean }) {
  const [editing, setEditing] = useState(false);
  // The picker opens in a portal, outside the row: keep the toolbar shown while it's open.
  const [picking, setPicking] = useState(false);
  const mine = m.author?.id === meId;
  const react = useApiMutation((emoji: string) => api(`collab/messages/${m.id}/reactions`, { method: "POST", body: JSON.stringify({ emoji }) }), {
    invalidate: COLLAB_KEYS,
  });
  const decide = useApiMutation(() => api(`collab/messages/${m.id}/decision`, { method: "POST", body: JSON.stringify({ isDecision: !m.isDecision }) }), {
    invalidate: COLLAB_KEYS,
    success: m.isDecision ? "No longer a decision" : "Marked as a decision",
  });
  const remove = useApiMutation(() => api(`collab/messages/${m.id}`, { method: "DELETE" }), { invalidate: COLLAB_KEYS });

  if (m.deleted) {
    return (
      <div className={cn("flex gap-3 px-4", grouped ? "py-0.5" : "pt-3")}>
        <div className="w-8 shrink-0" />
        <p className="text-sm italic text-tertiary">This message was deleted.</p>
      </div>
    );
  }

  const names = Object.fromEntries(m.mentions.map((x) => [x.id, x.name]));
  const editable = m.body.replace(MENTION_RE, (_, id: string) => `@${names[id] ?? "someone"}`);

  return (
    <div className={cn("group relative flex gap-3 px-4 hover:bg-secondary/40", picking && "bg-secondary/40", grouped ? "py-0.5" : "pt-3 pb-0.5", m.isDecision && "bg-finance/5")}>
      <div className="w-8 shrink-0">
        {grouped ? (
          <span className="invisible block pt-0.5 text-right font-mono text-[10px] text-tertiary group-hover:visible">{time(m.createdAt)}</span>
        ) : (
          <Avatar name={m.author?.name ?? "?"} src={m.author?.image} className="size-8" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {!grouped ? (
          <div className="flex items-baseline gap-2">
            <span className="text-sm font-semibold">{m.author?.name ?? "Former member"}</span>
            <span className="font-mono text-[11px] text-tertiary">{time(m.createdAt)}</span>
          </div>
        ) : null}
        {m.isDecision ? (
          <div className="mb-1 inline-flex items-center gap-1.5 rounded-md bg-finance/20 px-2 py-0.5 text-[11px] font-medium text-finance">
            <Gavel className="size-3" /> Decision{m.decisionBy ? ` · marked by ${m.decisionBy}` : ""}
          </div>
        ) : null}
        {editing ? (
          <div className="py-1">
            <Composer
              placeholder="Edit message"
              initial={editable}
              initialMentions={m.mentions}
              allowFiles={false}
              autoFocus
              compact
              onCancel={() => setEditing(false)}
              onSend={async (body) => {
                await api(`collab/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ body }) });
                setEditing(false);
              }}
            />
          </div>
        ) : (
          <MessageBody body={m.body} mentions={m.mentions} meId={meId} />
        )}
        {m.editedAt && !editing ? <span className="text-[11px] text-tertiary">(edited)</span> : null}
        {m.attachments.length ? (
          <div className="mt-1.5 flex flex-wrap gap-2">
            {m.attachments.map((a) =>
              a.contentType.startsWith("image/") ? (
                <a key={a.id} href={`/api/v1/files/${a.id}`} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border border-secondary">
                  <img src={`/api/v1/files/${a.id}`} alt={a.name} className="max-h-48 max-w-72 object-cover" loading="lazy" />
                </a>
              ) : (
                <a key={a.id} href={`/api/v1/files/${a.id}`} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg border border-secondary bg-primary px-3 py-2 text-sm hover:border-primary">
                  <FileText className="size-4 text-tertiary" />
                  <span className="max-w-56 truncate">{a.name}</span>
                  <span className="font-mono text-xs text-tertiary">{formatBytes(a.size)}</span>
                </a>
              ),
            )}
          </div>
        ) : null}
        {m.reactions.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {m.reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                title={r.names.join(", ")}
                onClick={() => react.mutate(r.emoji)}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                  r.mine ? "border-brand/60 bg-brand-solid/10" : "border-secondary bg-primary hover:border-primary",
                )}
              >
                <span>{r.emoji}</span>
                <span className="font-mono">{r.count}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {!editing ? (
        <div className={cn("absolute -top-3 right-4 hidden items-center rounded-lg border border-secondary bg-primary shadow-sm group-hover:flex group-focus-within:flex", picking && "flex")}>
          <Popover open={picking} onOpenChange={setPicking}>
            <PopoverTrigger asChild>
              <button type="button" aria-label="Add reaction" className="rounded-md p-1.5 text-tertiary hover:bg-secondary hover:text-primary">
                <SmilePlus className="size-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="flex w-auto gap-0.5 p-1" align="end">
              {QUICK_REACTIONS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => {
                    react.mutate(e);
                    setPicking(false);
                  }}
                  className="rounded-md p-1.5 text-lg leading-none hover:bg-secondary"
                  aria-label={`React with ${e}`}
                >
                  {e}
                </button>
              ))}
            </PopoverContent>
          </Popover>
          <button
            type="button"
            aria-label={m.isDecision ? "Unmark decision" : "Mark as decision"}
            title={m.isDecision ? "Unmark decision" : "Mark as decision"}
            onClick={() => decide.mutate(undefined)}
            className={cn("rounded-md p-1.5 hover:bg-secondary", m.isDecision ? "text-finance" : "text-tertiary hover:text-primary")}
          >
            <Gavel className="size-4" />
          </button>
          {mine ? (
            <button type="button" aria-label="Edit message" onClick={() => setEditing(true)} className="rounded-md p-1.5 text-tertiary hover:bg-secondary hover:text-primary">
              <Pencil className="size-4" />
            </button>
          ) : null}
          {mine || canModerate ? (
            <button
              type="button"
              aria-label="Delete message"
              onClick={() => confirm("Delete this message?") && remove.mutate(undefined)}
              className="rounded-md p-1.5 text-tertiary hover:bg-secondary hover:text-error-primary"
            >
              <Trash2 className="size-4" />
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** Messages grouped by day, with consecutive messages from one person collapsed. */
export function MessageList({ messages, meId, canModerate = false }: { messages: Message[]; meId?: string; canModerate?: boolean }) {
  let lastDay = "";
  return (
    <div className="pb-2">
      {messages.map((m, i) => {
        const prev = messages[i - 1];
        const day = new Date(m.createdAt).toDateString();
        const newDay = day !== lastDay;
        lastDay = day;
        const grouped =
          !newDay &&
          !!prev &&
          !prev.deleted &&
          prev.author?.id === m.author?.id &&
          new Date(m.createdAt).getTime() - new Date(prev.createdAt).getTime() < 5 * 60_000 &&
          !m.isDecision;
        return (
          <div key={m.id}>
            {newDay ? (
              <div className="relative my-3 flex items-center justify-center">
                <span className="absolute inset-x-4 top-1/2 h-px bg-border-secondary" />
                <span className="relative rounded-full border border-secondary bg-secondary px-3 py-0.5 text-[11px] font-medium text-tertiary">{dayLabel(m.createdAt)}</span>
              </div>
            ) : null}
            <MessageItem m={m} meId={meId} grouped={grouped} canModerate={canModerate} />
          </div>
        );
      })}
    </div>
  );
}
