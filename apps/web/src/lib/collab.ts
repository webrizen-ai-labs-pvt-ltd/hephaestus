import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { api } from "./api.ts";

export interface ChannelSummary {
  id: string;
  kind: "public" | "private" | "dm";
  name: string | null;
  description: string | null;
  isDefault: boolean;
  people: { id: string; name: string; image: string | null }[];
  unread: number;
  mentions: number;
  lastMessageAt: string;
}

export interface Message {
  id: string;
  channelId: string | null;
  threadId: string | null;
  author: { id: string; name: string; image: string | null } | null;
  body: string;
  mentions: { id: string; name: string }[];
  isDecision: boolean;
  decisionBy: string | null;
  decisionAt: string | null;
  editedAt: string | null;
  deleted: boolean;
  createdAt: string;
  reactions: { emoji: string; count: number; mine: boolean; names: string[] }[];
  attachments: { id: string; name: string; size: number; contentType: string }[];
}

export interface ContextMessage extends Message {
  context: { kind: "channel" | "task" | "project"; label: string; link: string };
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface MemberLite {
  id: string;
  userId: string;
  name: string;
  email: string;
  image: string | null;
}

export const useChannels = () =>
  useQuery({
    queryKey: ["channels"],
    queryFn: () => api<{ me: string; channels: ChannelSummary[]; browse: { id: string; name: string; description: string | null }[] }>("collab/channels"),
  });

export const useChannel = (id: string) =>
  useQuery({
    queryKey: ["channel", id],
    queryFn: () =>
      api<{
        channel: { id: string; kind: ChannelSummary["kind"]; name: string | null; description: string | null; isDefault: boolean; archived: boolean };
        members: { id: string; name: string; image: string | null }[];
        joined: boolean;
        canManage: boolean;
      }>(`collab/channels/${id}`),
  });

/** Newest page first from the server; pages are kept oldest → newest for display. */
export const useChannelMessages = (id: string) =>
  useInfiniteQuery({
    queryKey: ["messages", id],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      api<{ messages: Message[]; hasMore: boolean }>(`collab/channels/${id}/messages${pageParam ? `?before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (last) => (last.hasMore ? last.messages[0]?.createdAt : undefined),
  });

export const useThread = (type: "task" | "project", id: string) =>
  useQuery({ queryKey: ["thread", type, id], queryFn: () => api<{ messages: Message[] }>(`collab/threads/${type}/${id}`) });

export const useMembers = () =>
  useQuery({ queryKey: ["members", ""], queryFn: () => api<{ members: MemberLite[] }>("members"), staleTime: 60_000 });

export const useNotifications = () =>
  useQuery({ queryKey: ["notifications"], queryFn: () => api<{ notifications: Notification[] }>("notifications") });

export const useMentions = () => useQuery({ queryKey: ["mentions"], queryFn: () => api<{ mentions: ContextMessage[] }>("collab/mentions") });
export const useDecisions = () => useQuery({ queryKey: ["decisions"], queryFn: () => api<{ decisions: ContextMessage[] }>("collab/decisions") });

export const COLLAB_KEYS = ["channels", "channel", "messages", "thread", "mentions", "decisions"];
