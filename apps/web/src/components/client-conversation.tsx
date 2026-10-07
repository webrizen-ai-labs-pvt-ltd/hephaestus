import { Avatar, Badge, Button, cn, Input, Textarea } from "@operant/ui";
import { CheckCircle2, FileText, Paperclip, Plus, Send, Undo2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api.ts";
import { useApiMutation } from "../lib/people.ts";
import { type ChecklistItem, type FileRef, PORTAL_KEYS, type PortalMessage } from "../lib/portal.ts";

/*
 * The client conversation, as the team sees it. Kept visibly apart from internal
 * discussion: a client-coloured header and a reminder that the client reads this.
 */

const kb = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

export function FileLink({ file }: { file: FileRef }) {
  return (
    <a href={`/api/v1/files/${file.id}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 rounded-lg border border-secondary bg-primary px-2.5 py-1.5 text-xs hover:bg-secondary">
      <FileText className="size-4 shrink-0 text-tertiary" />
      <span className="truncate font-medium text-secondary">{file.name}</span>
      <span className="shrink-0 text-quaternary">{kb(file.size)}</span>
    </a>
  );
}

export function ClientConversation({ messages, postPath, clientName, canReply, closedNote }: { messages: PortalMessage[]; postPath: string; clientName: string; canReply: boolean; closedNote?: string }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // A block body: newer browsers return a Promise from scrollIntoView, which React would take as the cleanup.
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length]);

  const send = useApiMutation(
    async () => {
      const { message } = await api<{ message: { id: string } }>(postPath, { method: "POST", body: JSON.stringify({ body: body.trim() }) });
      for (const f of files) {
        const form = new FormData();
        form.set("file", f);
        form.set("ownerType", "portal_message");
        form.set("ownerId", message.id);
        await api("files", { method: "POST", body: form });
      }
    },
    {
      invalidate: PORTAL_KEYS,
      onSuccess: () => {
        setBody("");
        setFiles([]);
      },
    },
  );

  return (
    <div>
      <div className="max-h-[560px] space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 ? <p className="py-6 text-center text-sm text-tertiary">No messages yet.</p> : null}
        {messages.map((m) =>
          m.authorKind === "system" ? (
            <p key={m.id} className="mx-auto max-w-md text-center text-xs text-tertiary">
              {m.body} · {when(m.createdAt)}
            </p>
          ) : (
            <div key={m.id} className={cn("flex gap-3", m.authorKind === "staff" && "flex-row-reverse")}>
              <Avatar name={m.author?.name ?? "?"} src={m.author?.image} className="size-8" />
              <div className={cn("min-w-0 max-w-[80%]", m.authorKind === "staff" && "flex flex-col items-end")}>
                <div className="text-xs">
                  <span className="font-semibold text-primary">{m.author?.name}</span>
                  <span className="text-quaternary"> · {when(m.createdAt)}</span>
                  {m.authorKind === "staff" && m.seenByClientAt ? <span className="text-quaternary"> · Seen</span> : null}
                </div>
                {m.body ? (
                  <div className={cn("mt-1 whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm", m.authorKind === "staff" ? "rounded-tr-md bg-brand-solid text-white" : "rounded-tl-md bg-secondary text-primary")}>
                    {m.body}
                  </div>
                ) : null}
                {m.files.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.files.map((f) => (
                      <FileLink key={f.id} file={f} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
        <div ref={end} />
      </div>
      {closedNote ? (
        <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-sm text-tertiary">{closedNote}</p>
      ) : canReply ? (
        <div className="mt-4 rounded-xl border border-primary bg-primary p-2 shadow-xs focus-within:ring-2 focus-within:ring-brand">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (body.trim() || files.length)) send.mutate(undefined);
            }}
            placeholder={`Reply to ${clientName}…`}
            rows={2}
            className="resize-none border-0 shadow-none ring-0 focus:ring-0"
          />
          {files.length ? (
            <div className="flex flex-wrap gap-1.5 px-2 pb-2">
              {files.map((f, i) => (
                <Badge key={`${f.name}-${i}`} tone="neutral">
                  {f.name}
                  <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles(files.filter((_, j) => j !== i))}>
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
            </div>
          ) : null}
          <div className="flex items-center gap-2 px-1">
            <input ref={input} type="file" multiple hidden onChange={(e) => (setFiles([...files, ...Array.from(e.target.files ?? [])]), (e.target.value = ""))} />
            <Button size="sm" variant="ghost" onClick={() => input.current?.click()}>
              <Paperclip /> Attach
            </Button>
            <span className="hidden text-xs text-quaternary sm:block">{clientName} sees this, and gets an email.</span>
            <Button size="sm" variant="primary" className="ml-auto" disabled={send.isPending || (!body.trim() && !files.length)} onClick={() => send.mutate(undefined)}>
              <Send /> Send to client
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const DOC_STATUS = {
  requested: { label: "Waiting", tone: "neutral" },
  rejected: { label: "Sent back", tone: "danger" },
  uploaded: { label: "To review", tone: "brand" },
  accepted: { label: "Accepted", tone: "people" },
} as const;

/** The documents asked of the client: review uploads, send them back, ask for more. */
export function ReviewChecklist({ items, addPath, canEdit }: { items: ChecklistItem[]; addPath: string; canEdit: boolean }) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const add = useApiMutation(() => api(addPath, { method: "POST", body: JSON.stringify({ name }) }), {
    invalidate: PORTAL_KEYS,
    success: "Asked the client for it",
    onSuccess: () => (setName(""), setAdding(false)),
  });
  const review = useApiMutation(({ id, status, note }: { id: string; status: "accepted" | "rejected" | "requested"; note?: string }) => api(`client-documents/${id}`, { method: "PATCH", body: JSON.stringify({ status, note }) }), {
    invalidate: PORTAL_KEYS,
  });
  const remove = useApiMutation((id: string) => api(`client-documents/${id}`, { method: "DELETE" }), { invalidate: PORTAL_KEYS });

  return (
    <div>
      {items.length === 0 ? <p className="text-sm text-tertiary">No documents asked for yet.</p> : null}
      <ul className="divide-y divide-border-secondary">
        {items.map((d) => (
          <li key={d.id} className="py-3">
            <div className="flex items-start gap-3">
              {d.status === "accepted" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-fg-success-primary" /> : <FileText className="mt-0.5 size-5 shrink-0 text-quaternary" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium">{d.name}</span>
                  <Badge tone={DOC_STATUS[d.status].tone} dot pill>
                    {DOC_STATUS[d.status].label}
                  </Badge>
                </div>
                {d.hint ? <p className="text-xs text-tertiary">{d.hint}</p> : null}
                {d.status === "rejected" && d.note ? <p className="text-xs text-error-primary">{d.note}</p> : null}
                {d.files.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.files.map((f) => (
                      <FileLink key={f.id} file={f} />
                    ))}
                  </div>
                ) : null}
                {canEdit && d.status === "uploaded" ? (
                  <div className="mt-2 flex gap-2">
                    <Button size="xs" variant="primary" onClick={() => review.mutate({ id: d.id, status: "accepted" })}>
                      Accept
                    </Button>
                    <Button
                      size="xs"
                      onClick={() => {
                        const note = prompt("What's wrong with it? The client sees this.");
                        if (note !== null) review.mutate({ id: d.id, status: "rejected", note });
                      }}
                    >
                      Send back
                    </Button>
                  </div>
                ) : null}
              </div>
              {canEdit && d.status === "accepted" ? (
                <Button size="xs" variant="ghost" aria-label="Undo accept" onClick={() => review.mutate({ id: d.id, status: "requested" })}>
                  <Undo2 />
                </Button>
              ) : null}
              {canEdit && d.status === "requested" && !d.files.length ? (
                <Button size="xs" variant="ghost" aria-label={`Remove ${d.name}`} onClick={() => remove.mutate(d.id)}>
                  <X />
                </Button>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      {canEdit ? (
        adding ? (
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) add.mutate(undefined);
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Form 16 for FY 2025-26" autoFocus maxLength={120} />
            <Button type="submit" variant="primary" disabled={!name.trim() || add.isPending}>
              Ask
            </Button>
          </form>
        ) : (
          <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAdding(true)}>
            <Plus /> Ask for a document
          </Button>
        )
      ) : null}
    </div>
  );
}
