import type { Realtime, RealtimeEvent } from "@hephaestus/core";

/**
 * In-process event bus: one server process (local development, the offline
 * edition's host PC). Browsers receive events over Server-Sent Events.
 */
export class MemoryRealtime implements Realtime {
  private readonly listeners = new Set<(e: RealtimeEvent) => void>();

  async publish(event: RealtimeEvent) {
    for (const l of this.listeners) {
      try {
        l(event);
      } catch (err) {
        console.error("Realtime listener failed", err);
      }
    }
  }

  subscribe(listener: (e: RealtimeEvent) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
