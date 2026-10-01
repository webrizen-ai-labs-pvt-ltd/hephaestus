import { Fragment, type ReactNode } from "react";

/*
 * Message text is plain text. We render a small, safe subset: @mentions,
 * links, **bold**, _italic_, `code` and line breaks. Nothing is injected as HTML.
 */

const TOKEN = /(@\[member:[0-9a-f-]{36}\])|(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])|(\*\*[^*\n]+\*\*)|(`[^`\n]+`)|(_[^_\n]+_)/g;

function inline(text: string, names: Record<string, string>, meId: string | undefined, key: string): ReactNode[] {
  const out: ReactNode[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    const [whole, mention, url, bold, code, italic] = m;
    const k = `${key}-${m.index}`;
    if (mention) {
      const id = mention.slice(9, -1);
      out.push(
        <span key={k} className={id === meId ? "rounded bg-primary/20 px-1 font-medium text-accent" : "rounded bg-collab/15 px-1 font-medium text-collab"}>
          @{names[id] ?? "someone"}
        </span>,
      );
    } else if (url) {
      out.push(
        <a key={k} href={url} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline-offset-2 hover:underline">
          {url}
        </a>,
      );
    } else if (bold) out.push(<strong key={k}>{bold.slice(2, -2)}</strong>);
    else if (code) out.push(<code key={k} className="rounded bg-surface-2 px-1 py-0.5 font-mono text-[0.85em]">{code.slice(1, -1)}</code>);
    else if (italic) out.push(<em key={k}>{italic.slice(1, -1)}</em>);
    else out.push(whole);
    last = m.index! + whole.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function MessageBody({ body, mentions, meId }: { body: string; mentions: { id: string; name: string }[]; meId?: string }) {
  const names = Object.fromEntries(mentions.map((m) => [m.id, m.name]));
  const lines = body.split("\n");
  return (
    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed">
      {lines.map((line, i) => (
        <Fragment key={i}>
          {inline(line, names, meId, String(i))}
          {i < lines.length - 1 ? "\n" : null}
        </Fragment>
      ))}
    </div>
  );
}
