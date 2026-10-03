import { Avatar, Badge, Button, cn, Textarea } from "@hephaestus/ui";
import { CheckCircle2, FileText, Paperclip, Send, Upload, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type ChecklistItem, type FileRef, fileUrl, type Message, uploadFile, useAction, when } from "../lib/api.ts";

const kb = (n: number) => (n > 1_048_576 ? `${(n / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export function FileChip({ slug, file, className }: { slug: string; file: FileRef; className?: string }) {
  return (
    <a
      href={fileUrl(slug, file.id)}
      target="_blank"
      rel="noreferrer"
      className={cn("inline-flex max-w-full items-center gap-2 rounded-lg border border-secondary bg-primary px-2.5 py-1.5 text-xs hover:bg-secondary", className)}
    >
      <FileText className="size-4 shrink-0 text-tertiary" />
      <span className="truncate font-medium text-secondary">{file.name}</span>
      <span className="shrink-0 text-quaternary">{kb(file.size)}</span>
    </a>
  );
}

/** The thread with the team: their messages on the left with name and photo, the client's on the right. */
export function Conversation({ slug, messages, postPath, disabled }: { slug: string; messages: Message[]; postPath: string; disabled?: string }) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ block: "nearest" }), [messages.length]);

  const send = useAction(
    async () => {
      const { message } = await api<{ message: { id: string } }>(postPath, { method: "POST", body: JSON.stringify({ body: body.trim() }) });
      for (const f of files) await uploadFile(slug, f, "portal_message", message.id);
    },
    {
      onSuccess: () => {
        setBody("");
        setFiles([]);
      },
    },
  );

  return (
    <div>
      <div className="max-h-[560px] space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 ? <p className="py-6 text-center text-sm text-tertiary">No messages yet. Ask anything, the team will reply here.</p> : null}
        {messages.map((m) =>
          m.authorKind === "system" ? (
            <p key={m.id} className="mx-auto max-w-md text-center text-xs text-tertiary">
              {m.body} · {when(m.createdAt)}
            </p>
          ) : m.authorKind === "client" ? (
            <div key={m.id} className="flex flex-col items-end">
              {m.body ? <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-brand-solid px-4 py-2.5 text-sm text-white">{m.body}</div> : null}
              {m.files.length ? (
                <div className="mt-1.5 flex max-w-[85%] flex-wrap justify-end gap-1.5">
                  {m.files.map((f) => (
                    <FileChip key={f.id} slug={slug} file={f} />
                  ))}
                </div>
              ) : null}
              <span className="mt-1 text-[11px] text-quaternary">
                {m.author?.name} · {when(m.createdAt)}
                {m.seenByStaffAt ? " · Seen" : ""}
              </span>
            </div>
          ) : (
            <div key={m.id} className="flex gap-3">
              <Avatar name={m.author?.name ?? "Team"} src={m.author?.image} className="size-9" />
              <div className="min-w-0 max-w-[85%]">
                <div className="text-xs">
                  <span className="font-semibold text-primary">{m.author?.name}</span>
                  {m.author?.jobTitle ? <span className="text-tertiary"> · {m.author.jobTitle}</span> : null}
                  <span className="text-quaternary"> · {when(m.createdAt)}</span>
                </div>
                {m.body ? <div className="mt-1 whitespace-pre-wrap rounded-2xl rounded-tl-md bg-secondary px-4 py-2.5 text-sm text-primary">{m.body}</div> : null}
                {m.files.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {m.files.map((f) => (
                      <FileChip key={f.id} slug={slug} file={f} />
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ),
        )}
        <div ref={end} />
      </div>

      {disabled ? (
        <p className="mt-4 rounded-lg bg-secondary px-3 py-2 text-sm text-tertiary">{disabled}</p>
      ) : (
        <div className="mt-4 rounded-xl border border-primary bg-primary p-2 shadow-xs focus-within:ring-2 focus-within:ring-brand">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey) && (body.trim() || files.length)) send.mutate(undefined);
            }}
            placeholder="Write a message…"
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
            <span className="hidden text-xs text-quaternary sm:block">Ctrl + Enter to send</span>
            <Button size="sm" variant="primary" className="ml-auto" disabled={send.isPending || (!body.trim() && !files.length)} onClick={() => send.mutate(undefined)}>
              <Send /> {send.isPending ? "Sending…" : "Send"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

const DOC_STATUS = {
  requested: { label: "Needed", tone: "warning" },
  rejected: { label: "Upload again", tone: "danger" },
  uploaded: { label: "Uploaded", tone: "collab" },
  accepted: { label: "Accepted", tone: "people" },
} as const;

/** Documents the team asked for: upload against each one, see if it's been accepted. */
export function Checklist({ slug, items }: { slug: string; items: ChecklistItem[] }) {
  const upload = useAction(async ({ id, files }: { id: string; files: File[] }) => {
    for (const f of files) await uploadFile(slug, f, "client_document", id);
  }, { success: "Uploaded. The team will review it." });
  if (!items.length) return <p className="text-sm text-tertiary">Nothing needed right now.</p>;
  const done = items.filter((d) => d.status === "accepted").length;
  return (
    <div>
      <p className="mb-3 text-sm text-tertiary">
        {done} of {items.length} accepted
      </p>
      <ul className="divide-y divide-border-secondary">
        {items.map((d) => (
          <li key={d.id} className="py-3">
            <div className="flex items-start gap-3">
              {d.status === "accepted" ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-fg-success-primary" /> : <FileText className="mt-0.5 size-5 shrink-0 text-quaternary" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-primary">{d.name}</span>
                  <Badge tone={DOC_STATUS[d.status].tone} dot pill>
                    {DOC_STATUS[d.status].label}
                  </Badge>
                </div>
                {d.hint ? <p className="mt-0.5 text-xs text-tertiary">{d.hint}</p> : null}
                {d.status === "rejected" && d.note ? <p className="mt-1 text-xs text-error-primary">{d.note}</p> : null}
                {d.files.length ? (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {d.files.map((f) => (
                      <FileChip key={f.id} slug={slug} file={f} />
                    ))}
                  </div>
                ) : null}
              </div>
              {d.status !== "accepted" ? (
                <label className="shrink-0">
                  <input
                    type="file"
                    multiple
                    hidden
                    disabled={upload.isPending}
                    onChange={(e) => {
                      const files = Array.from(e.target.files ?? []);
                      e.target.value = "";
                      if (files.length) upload.mutate({ id: d.id, files });
                    }}
                  />
                  <span className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-primary bg-primary px-3 py-1.5 text-sm font-semibold text-secondary shadow-xs-skeuomorphic hover:bg-secondary">
                    <Upload className="size-4" /> {d.files.length ? "Add" : "Upload"}
                  </span>
                </label>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
