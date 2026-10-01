import { mentionToken } from "@hephaestus/core";
import { Avatar, Button, cn } from "@hephaestus/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Paperclip, SendHorizontal, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api } from "../../lib/api.ts";
import { type MemberLite, useMembers } from "../../lib/collab.ts";

/*
 * While typing, mentions show as "@Name"; on send they become @[member:<id>]
 * tokens. We remember which names were picked from the list so plain text
 * like "@Priya" typed by hand isn't silently turned into a mention.
 */

export async function uploadFiles(messageId: string, files: File[]) {
  for (const file of files) {
    const form = new FormData();
    form.set("file", file);
    form.set("ownerType", "message");
    form.set("ownerId", messageId);
    await api("files", { method: "POST", body: form });
  }
}

export function Composer({
  placeholder,
  onSend,
  disabled,
  autoFocus,
  allowFiles = true,
  initial = "",
  initialMentions = [],
  onCancel,
  compact,
}: {
  placeholder: string;
  /** Returns the created message id, so attachments can follow. */
  onSend: (body: string) => Promise<string | void>;
  disabled?: boolean;
  autoFocus?: boolean;
  allowFiles?: boolean;
  initial?: string;
  initialMentions?: { id: string; name: string }[];
  onCancel?: () => void;
  compact?: boolean;
}) {
  const qc = useQueryClient();
  const { data } = useMembers();
  const people = data?.members ?? [];
  const [text, setText] = useState(initial);
  const [picked, setPicked] = useState<{ id: string; name: string }[]>(initialMentions);
  const [files, setFiles] = useState<File[]>([]);
  const [query, setQuery] = useState<string | null>(null);
  const [highlight, setHighlight] = useState(0);
  const [sending, setSending] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const suggestions = useMemo(
    () => (query === null ? [] : people.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())).slice(0, 6)),
    [query, people],
  );

  const detectMention = (value: string, caret: number) => {
    const before = value.slice(0, caret);
    const m = /(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u.exec(before);
    setQuery(m ? m[1]! : null);
    setHighlight(0);
  };

  const choose = (p: MemberLite) => {
    const el = ref.current!;
    const caret = el.selectionStart;
    const before = text.slice(0, caret).replace(/@([\p{L}\p{N}._-]{0,30})$/u, `@${p.name} `);
    const next = before + text.slice(caret);
    setText(next);
    setPicked((list) => (list.some((x) => x.id === p.id) ? list : [...list, { id: p.id, name: p.name }]));
    setQuery(null);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(before.length, before.length);
    });
  };

  const encode = (value: string) => {
    let out = value;
    // Longest names first, so "Priya S" wins over "Priya".
    for (const p of [...picked].sort((a, b) => b.name.length - a.name.length)) {
      out = out.split(`@${p.name}`).join(mentionToken(p.id));
    }
    return out.trim();
  };

  const send = async () => {
    const body = encode(text);
    if ((!body && !files.length) || sending) return;
    setSending(true);
    try {
      const id = await onSend(body || files.map((f) => f.name).join(", "));
      if (id && files.length) {
        await uploadFiles(id, files);
        // The message was fetched before its files existed; refresh to show them.
        await Promise.all(["thread", "messages"].map((k) => qc.invalidateQueries({ queryKey: [k] })));
      }
      setText("");
      setPicked([]);
      setFiles([]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSending(false);
      requestAnimationFrame(() => ref.current?.focus());
    }
  };

  return (
    <div className="relative">
      {suggestions.length ? (
        <ul className="absolute bottom-full left-0 z-20 mb-2 w-72 overflow-hidden rounded-lg border border-border bg-surface p-1 shadow-[0_12px_32px_-12px_rgb(0_0_0/0.45)]" role="listbox">
          {suggestions.map((p, i) => (
            <li key={p.id} role="option" aria-selected={i === highlight}>
              <button
                type="button"
                onMouseDown={(e) => (e.preventDefault(), choose(p))}
                className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm", i === highlight && "bg-surface-2")}
              >
                <Avatar name={p.name} src={p.image} className="size-6 text-[10px]" />
                <span className="flex-1 truncate">{p.name}</span>
                <span className="truncate text-xs text-muted-foreground">{p.email}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <div className={cn("rounded-xl border border-input bg-surface focus-within:border-ring", disabled && "opacity-60")}>
        <textarea
          ref={ref}
          value={text}
          disabled={disabled || sending}
          autoFocus={autoFocus}
          placeholder={placeholder}
          rows={1}
          maxLength={10_000}
          aria-label={placeholder}
          onChange={(e) => {
            setText(e.target.value);
            detectMention(e.target.value, e.target.selectionStart);
          }}
          onKeyDown={(e) => {
            if (suggestions.length) {
              if (e.key === "ArrowDown") return (e.preventDefault(), setHighlight((h) => (h + 1) % suggestions.length));
              if (e.key === "ArrowUp") return (e.preventDefault(), setHighlight((h) => (h - 1 + suggestions.length) % suggestions.length));
              if (e.key === "Enter" || e.key === "Tab") return (e.preventDefault(), choose(suggestions[highlight]!));
              if (e.key === "Escape") return setQuery(null);
            }
            if (e.key === "Escape" && onCancel) return onCancel();
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          className={cn("field-sizing-content block max-h-60 w-full resize-none bg-transparent px-3 text-sm outline-none placeholder:text-muted-foreground", compact ? "min-h-9 py-2" : "min-h-11 py-3")}
        />
        {files.length ? (
          <div className="flex flex-wrap gap-1.5 px-3 pb-2">
            {files.map((f, i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-md bg-surface-2 px-2 py-1 text-xs">
                <Paperclip className="size-3" />
                <span className="max-w-40 truncate">{f.name}</span>
                <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((l) => l.filter((_, j) => j !== i))}>
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <div className="flex items-center gap-1 px-2 pb-2">
          {allowFiles ? (
            <>
              <Button type="button" size="icon" variant="ghost" aria-label="Attach files" className="size-8" onClick={() => fileInput.current?.click()}>
                <Paperclip />
              </Button>
              <input
                ref={fileInput}
                type="file"
                multiple
                hidden
                onChange={(e) => {
                  setFiles((l) => [...l, ...Array.from(e.target.files ?? [])].slice(0, 10));
                  e.target.value = "";
                }}
              />
            </>
          ) : null}
          <span className="hidden text-[11px] text-muted-foreground sm:inline">
            <kbd className="font-mono">Enter</kbd> to send · <kbd className="font-mono">Shift + Enter</kbd> for a new line · <kbd className="font-mono">@</kbd> to mention
          </span>
          {onCancel ? (
            <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onCancel}>
              Cancel
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="primary"
            className={onCancel ? "" : "ml-auto"}
            disabled={sending || (!text.trim() && !files.length)}
            onClick={() => void send()}
            aria-label="Send"
          >
            <SendHorizontal />
          </Button>
        </div>
      </div>
    </div>
  );
}
