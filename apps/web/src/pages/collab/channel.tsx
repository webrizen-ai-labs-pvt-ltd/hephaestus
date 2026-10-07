import { can } from "@operant/core";
import { Avatar, Button, Card, EmptyState, Skeleton } from "@operant/ui";
import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams, useRouter } from "@tanstack/react-router";
import { ArrowLeft, AtSign, Gavel, Hash, Lock, LogOut, MessagesSquare } from "lucide-react";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Composer } from "../../components/collab/composer.tsx";
import { MessageBody } from "../../components/collab/message-body.tsx";
import { MessageList } from "../../components/collab/message-list.tsx";
import { api, type Me } from "../../lib/api.ts";
import { COLLAB_KEYS, type ContextMessage, type Message, useChannel, useChannelMessages, useChannels, useDecisions, useMentions } from "../../lib/collab.ts";
import { useApiMutation } from "../../lib/people.ts";
import { useCrumb } from "../../lib/breadcrumbs.ts";

function MobileBack() {
  return (
    <Link to="/collab" className="rounded-md p-1 text-tertiary hover:text-primary md:hidden" aria-label="All conversations">
      <ArrowLeft className="size-5" />
    </Link>
  );
}

export function ChannelPage({ me }: { me: Me }) {
  const { id } = useParams({ strict: false }) as { id: string };
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: info, error } = useChannel(id);
  const { data: list } = useChannels();
  useCrumb(info ? (info.channel.kind === "dm" ? info.channel.name : `#${info.channel.name}`) : null);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useChannelMessages(id);
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const prevHeight = useRef(0);

  const messages = useMemo(() => (data ? [...data.pages].reverse().flatMap((p) => p.messages) : []), [data]);
  const unread = list?.channels.find((c) => c.id === id)?.unread ?? 0;

  // Keep the view pinned to the newest message, unless the reader scrolled up.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    if (stick.current) el.scrollTop = el.scrollHeight;
    else if (prevHeight.current && el.scrollHeight > prevHeight.current && el.scrollTop < 50) {
      // Older messages were added above: keep the reader's place.
      el.scrollTop += el.scrollHeight - prevHeight.current;
    }
    prevHeight.current = el.scrollHeight;
  }, [messages]);

  useEffect(() => {
    stick.current = true;
    prevHeight.current = 0;
  }, [id]);

  // Reading the channel clears its unread count.
  useEffect(() => {
    if (!info?.joined || unread === 0) return;
    void api(`collab/channels/${id}/read`, { method: "POST" }).then(() => qc.invalidateQueries({ queryKey: ["channels"] }));
  }, [id, info?.joined, unread, messages.length, qc]);

  const join = useApiMutation(() => api(`collab/channels/${id}/join`, { method: "POST" }), { invalidate: COLLAB_KEYS });
  const leave = useApiMutation(() => api(`collab/channels/${id}/leave`, { method: "POST" }), {
    invalidate: COLLAB_KEYS,
    success: "You left the channel",
    onSuccess: () => navigate({ to: "/collab" }),
  });

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <EmptyState icon={<MessagesSquare />} title="Conversation not found" description="It may be private, or it no longer exists." />
      </div>
    );
  }

  const ch = info?.channel;
  const Icon = ch?.kind === "private" ? Lock : Hash;

  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-secondary px-4">
        <MobileBack />
        {ch ? (
          ch.kind === "dm" ? (
            <Avatar name={ch.name ?? "?"} src={info?.members.find((m) => m.name === ch.name)?.image} className="size-7 text-[10px]" />
          ) : (
            <Icon className="size-4 text-tertiary" />
          )
        ) : null}
        <div className="min-w-0 flex-1">
          <h1 className="truncate font-display text-base font-bold">{ch ? (ch.kind === "dm" ? ch.name : ch.name) : <Skeleton className="h-4 w-32" />}</h1>
          {ch?.description ? <p className="truncate text-xs text-tertiary">{ch.description}</p> : null}
        </div>
        {info && ch?.kind !== "dm" ? (
          <span className="flex -space-x-1.5" title={info.members.map((m) => m.name).join(", ")}>
            {info.members.slice(0, 4).map((m) => (
              <Avatar key={m.id} name={m.name} src={m.image} className="size-6 border-2 border-bg-primary text-[9px]" />
            ))}
            {info.members.length > 4 ? (
              <span className="flex size-6 items-center justify-center rounded-full border-2 border-bg-primary bg-secondary font-mono text-[9px]">+{info.members.length - 4}</span>
            ) : null}
          </span>
        ) : null}
        {info?.joined && ch && ch.kind !== "dm" && !ch.isDefault ? (
          <Button size="icon" variant="ghost" aria-label="Leave channel" title="Leave channel" onClick={() => confirm("Leave this channel?") && leave.mutate(undefined)}>
            <LogOut />
          </Button>
        ) : null}
      </header>

      <div
        ref={scroller}
        className="flex-1 overflow-y-auto"
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 120 && hasNextPage && !isFetchingNextPage) void fetchNextPage();
        }}
      >
        {isLoading ? (
          <div className="space-y-4 p-4">
            <Skeleton className="h-12 w-2/3" />
            <Skeleton className="h-12 w-1/2" />
          </div>
        ) : null}
        {hasNextPage ? <p className="py-3 text-center text-xs text-tertiary">{isFetchingNextPage ? "Loading earlier messages…" : "Scroll up for earlier messages"}</p> : null}
        {!isLoading && !hasNextPage && ch ? (
          <div className="px-4 pb-2 pt-8">
            <div className="flex size-12 items-center justify-center rounded-xl bg-secondary text-tertiary">
              {ch.kind === "dm" ? <MessagesSquare className="size-6" /> : <Icon className="size-6" />}
            </div>
            <h2 className="mt-3 text-xl font-bold">{ch.kind === "dm" ? `You and ${ch.name}` : `Welcome to #${ch.name}`}</h2>
            <p className="mt-1 text-sm text-tertiary">
              {ch.kind === "dm" ? "This is the start of your conversation." : (ch.description ?? "This is the very beginning of the channel.")}
            </p>
          </div>
        ) : null}
        <MessageList messages={messages} meId={list?.me} canModerate={can(me.org.permissions, "channel", "manage")} />
      </div>

      <div className="shrink-0 border-t border-secondary p-3">
        {info && !info.joined ? (
          <div className="flex items-center justify-between gap-3 rounded-xl bg-secondary px-4 py-3 text-sm">
            <span>You're viewing #{ch?.name}. Join to post and get updates.</span>
            <Button variant="primary" size="sm" onClick={() => join.mutate(undefined)}>
              Join channel
            </Button>
          </div>
        ) : ch?.archived ? (
          <p className="text-center text-sm text-tertiary">This channel is archived.</p>
        ) : (
          <Composer
            key={id}
            autoFocus
            placeholder={ch ? (ch.kind === "dm" ? `Message ${ch.name}` : `Message #${ch.name}`) : "Message"}
            onSend={async (body) => {
              stick.current = true;
              const r = await api<{ message: Message }>(`collab/channels/${id}/messages`, { method: "POST", body: JSON.stringify({ body }) });
              await qc.invalidateQueries({ queryKey: ["messages", id] });
              return r.message.id;
            }}
          />
        )}
      </div>
    </>
  );
}

function ContextList({ items, empty, icon }: { items: ContextMessage[] | undefined; empty: { title: string; description: string }; icon: React.ReactNode }) {
  const { data: list } = useChannels();
  const router = useRouter();
  if (items && items.length === 0) {
    return (
      <div className="p-6">
        <Card>
          <EmptyState icon={icon} title={empty.title} description={empty.description} />
        </Card>
      </div>
    );
  }
  return (
    <ul className="space-y-3 p-4 sm:p-6">
      {items?.map((m) => (
        <li key={m.id}>
          <Card className="p-4">
            <div className="mb-2 flex items-center gap-2 text-xs text-tertiary">
              <Avatar name={m.author?.name ?? "?"} src={m.author?.image} className="size-5 text-[9px]" />
              <span className="font-medium text-primary">{m.author?.name}</span>
              <span>in</span>
              <a
                href={m.context.link}
                onClick={(e) => {
                  e.preventDefault();
                  router.history.push(m.context.link);
                }}
                className="truncate font-medium text-brand-secondary hover:underline"
              >
                {m.context.kind === "channel" ? m.context.label : `${m.context.kind === "task" ? "Task" : "Project"}: ${m.context.label}`}
              </a>
              <span className="ml-auto shrink-0 font-mono">
                {new Date(m.isDecision && m.decisionAt ? m.decisionAt : m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
              </span>
            </div>
            <MessageBody body={m.body} mentions={m.mentions} meId={list?.me} />
            {m.isDecision && m.decisionBy ? <p className="mt-2 text-xs text-finance">Marked as a decision by {m.decisionBy}</p> : null}
          </Card>
        </li>
      ))}
    </ul>
  );
}

export function MentionsPage() {
  const { data } = useMentions();
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-secondary px-4">
        <MobileBack />
        <AtSign className="size-4 text-tertiary" />
        <h1 className="font-display text-base font-bold">Mentions</h1>
      </header>
      <div className="flex-1 overflow-y-auto">
        <ContextList items={data?.mentions} icon={<AtSign />} empty={{ title: "No mentions yet", description: "When someone @mentions you in a channel or a comment, it shows up here." }} />
      </div>
    </>
  );
}

export function DecisionsPage() {
  const { data } = useDecisions();
  return (
    <>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-secondary px-4">
        <MobileBack />
        <Gavel className="size-4 text-finance" />
        <div>
          <h1 className="font-display text-base font-bold">Decisions</h1>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        <ContextList
          items={data?.decisions}
          icon={<Gavel />}
          empty={{ title: "No decisions recorded", description: "Hover over any message and choose \"Mark as decision\" so it's easy to find later." }}
        />
      </div>
    </>
  );
}

/** /collab on desktop opens #general (or the most recent conversation). */
export function CollabIndexPage() {
  const { data } = useChannels();
  const navigate = useNavigate();
  useEffect(() => {
    if (!data || window.matchMedia("(max-width: 767px)").matches) return;
    const target = data.channels.find((c) => c.isDefault) ?? data.channels[0];
    if (target) navigate({ to: "/collab/c/$id", params: { id: target.id }, replace: true });
  }, [data, navigate]);
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <EmptyState icon={<MessagesSquare />} title="Pick a conversation" description="Choose a channel or a direct message." />
    </div>
  );
}
