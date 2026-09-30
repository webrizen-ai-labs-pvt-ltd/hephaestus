import type { Mailer, Realtime } from "@hephaestus/core";

/** Realtime that drops events (used until a realtime backend is configured). */
export const noopRealtime: Realtime = { publish: async () => {} };

/** Mailer that logs instead of sending (local development). */
export const consoleMailer: Mailer = {
  enabled: false,
  send: async (m) => console.info(`[mail] to=${m.to} subject="${m.subject}"`),
};
