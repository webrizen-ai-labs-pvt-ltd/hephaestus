import { Button, cn, EmptyState, Popover, PopoverContent, PopoverTrigger } from "@hephaestus/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "@tanstack/react-router";
import { AtSign, Bell, CalendarCheck, CheckCheck, ListTodo, MessageSquare, Sparkles } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api.ts";
import { type Notification, useNotifications } from "../lib/collab.ts";

function iconFor(type: string) {
  if (type.includes("mention")) return <AtSign className="size-4 text-brand-secondary" />;
  if (type.startsWith("message") || type.startsWith("comment")) return <MessageSquare className="size-4 text-collab" />;
  if (type.startsWith("leave")) return <CalendarCheck className="size-4 text-people" />;
  if (type.startsWith("task")) return <ListTodo className="size-4 text-work" />;
  return <Sparkles className="size-4 text-finance" />;
}

function ago(iso: string) {
  const s = Math.round((Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86_400) return `${Math.floor(s / 3600)}h`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function NotificationBell() {
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const { data } = useNotifications();
  const list = data?.notifications ?? [];
  const unread = list.filter((n) => !n.readAt).length;

  const openOne = async (n: Notification) => {
    setOpen(false);
    if (!n.readAt) {
      await api(`notifications/${n.id}/read`, { method: "POST" });
      void qc.invalidateQueries({ queryKey: ["notifications"] });
    }
    if (n.link) router.history.push(n.link);
  };

  const readAll = async () => {
    await api("notifications/read-all", { method: "POST" });
    void qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"} className="relative p-0! size-9">
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="size-14">
            <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 0 0 5.454-1.31A8.967 8.967 0 0 1 18 9.75V9A6 6 0 0 0 6 9v.75a8.967 8.967 0 0 1-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 0 1-5.714 0m5.714 0a3 3 0 1 1-5.714 0" />
          </svg>
          {unread ? (
            <span className="absolute right-0.5 top-0.5 flex min-w-2 min-h-2 items-center justify-center rounded-full bg-brand-solid px-1 font-mono text-[8px] leading-4 text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(380px,calc(100vw-24px))] p-0">
        <div className="flex items-center justify-between border-b border-secondary px-4 py-3">
          <span className="font-display font-bold">Notifications</span>
          {unread ? (
            <Button size="sm" variant="ghost" onClick={() => void readAll()}>
              <CheckCheck /> Mark all read
            </Button>
          ) : null}
        </div>
        {list.length === 0 ? (
          <EmptyState icon={<Bell />} title="You're all caught up" description="Mentions, assignments and approvals show up here." />
        ) : (
          <ul className="max-h-[60vh] divide-y divide-border-secondary overflow-y-auto">
            {list.map((n) => (
              <li key={n.id}>
                <button type="button" onClick={() => void openOne(n)} className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-secondary", !n.readAt && "bg-brand-solid/5")}>
                  <span className="mt-0.5">{iconFor(n.type)}</span>
                  <span className="min-w-0 flex-1">
                    <span className={cn("block text-sm", !n.readAt && "font-medium")}>{n.title}</span>
                    {n.body ? <span className="mt-0.5 line-clamp-2 block text-xs text-tertiary">{n.body}</span> : null}
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <span className="font-mono text-[11px] text-tertiary">{ago(n.createdAt)}</span>
                    {!n.readAt ? <span className="size-2 rounded-full bg-brand-solid" /> : null}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
