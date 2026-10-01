import { type QueryClient, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { api } from "./api.ts";
import { WORK_KEYS } from "./work.ts";

export interface LiveEvent {
  /** e.g. "channel:<id>", "thread:task:<id>", "user:<userId>", "project:<id>" */
  scope: string;
  type: string;
  payload: Record<string, unknown>;
}

const listeners = new Set<(e: LiveEvent) => void>();

/** Components can react to live events directly (e.g. scroll to a new message). */
export function onLiveEvent(fn: (e: LiveEvent) => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Events only say *what* changed; refetch the affected data through the API. */
function route(qc: QueryClient, e: LiveEvent) {
  const [kind, a, b] = e.scope.split(":");
  if (kind === "user") void qc.invalidateQueries({ queryKey: ["notifications"] });
  if (kind === "channel") {
    void qc.invalidateQueries({ queryKey: ["messages", a] });
    void qc.invalidateQueries({ queryKey: ["channels"] });
    if (e.type === "channel.members") void qc.invalidateQueries({ queryKey: ["channel", a] });
  }
  if (kind === "thread") void qc.invalidateQueries({ queryKey: ["thread", a, b] });
  if (kind === "project" || kind === "tasks") for (const k of WORK_KEYS) void qc.invalidateQueries({ queryKey: [k] });
  if (e.type.startsWith("message.") || kind === "thread") {
    void qc.invalidateQueries({ queryKey: ["mentions"] });
    void qc.invalidateQueries({ queryKey: ["decisions"] });
  }
  for (const l of listeners) l(e);
}

/**
 * One live connection per signed-in tab. The cloud uses Supabase Realtime
 * (with a short-lived token from our API); local development and the offline
 * edition use Server-Sent Events from the API itself.
 */
export function useLiveEvents() {
  const qc = useQueryClient();

  useEffect(() => {
    let stopped = false;
    let cleanup: (() => void) | undefined;

    async function viaSupabase(cfg: { url: string; publishableKey: string; token: string; expiresIn: number; orgId: string }) {
      const { createClient } = await import("@supabase/supabase-js");
      const client = createClient(cfg.url, cfg.publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
      await client.realtime.setAuth(cfg.token);
      const channel = client
        .channel(`org:${cfg.orgId}`, { config: { private: true } })
        .on("broadcast", { event: "event" }, (msg) => route(qc, msg.payload as LiveEvent))
        .subscribe();
      // Tokens live 10 minutes; renew a minute early.
      const timer = setInterval(async () => {
        try {
          const next = await api<{ token: string }>("/api/supabase-token");
          await client.realtime.setAuth(next.token);
        } catch {
          // Signed out or offline: the next page load reconnects.
        }
      }, Math.max(60, cfg.expiresIn - 60) * 1000);
      return () => {
        clearInterval(timer);
        void client.removeChannel(channel);
      };
    }

    function viaEventSource() {
      let source: EventSource | null = null;
      let retry: ReturnType<typeof setTimeout> | undefined;
      const connect = () => {
        source = new EventSource("/api/v1/events");
        source.addEventListener("message", (m) => {
          try {
            route(qc, JSON.parse((m as MessageEvent).data) as LiveEvent);
          } catch {
            // Ignore malformed events.
          }
        });
        source.addEventListener("ready", () => {
          // Catch up on anything missed while disconnected.
          void qc.invalidateQueries({ queryKey: ["notifications"] });
          void qc.invalidateQueries({ queryKey: ["channels"] });
        });
        source.onerror = () => {
          source?.close();
          if (!stopped) retry = setTimeout(connect, 3000);
        };
      };
      connect();
      return () => {
        clearTimeout(retry);
        source?.close();
      };
    }

    (async () => {
      try {
        const cfg = await api<{ enabled: boolean; url: string; publishableKey: string; token: string; expiresIn: number; orgId: string }>(
          "/api/supabase-token",
        );
        if (stopped) return;
        cleanup = cfg.enabled ? await viaSupabase(cfg) : viaEventSource();
      } catch {
        if (!stopped) cleanup = viaEventSource();
      }
      if (stopped) cleanup?.();
    })();

    return () => {
      stopped = true;
      cleanup?.();
    };
  }, [qc]);
}
