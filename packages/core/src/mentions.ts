/** Mentions are stored in message text as @[member:<uuid>] tokens. */
export const MENTION_RE = /@\[member:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/g;

export function extractMentions(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION_RE)].map((m) => m[1]!))];
}

export function mentionToken(memberId: string) {
  return `@[member:${memberId}]`;
}

/** Plain-text preview (notifications, emails, channel lists). */
export function previewText(body: string, names: Record<string, string>, max = 140) {
  const text = body.replace(MENTION_RE, (_, id: string) => `@${names[id] ?? "someone"}`).replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

export const QUICK_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "🙏", "🔥"] as const;
