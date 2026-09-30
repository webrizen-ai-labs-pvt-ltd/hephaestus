/**
 * Adapter interfaces. Business logic depends only on these; each edition
 * (cloud / offline) provides its own implementations.
 */

export interface StoredFile {
  key: string;
  size: number;
  contentType: string;
}

export interface FileStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<StoredFile>;
  /** A URL the browser can download from (signed in the cloud, API-served offline). */
  getUrl(key: string, expiresInSeconds?: number): Promise<string>;
  delete(key: string): Promise<void>;
}

export interface RealtimeEvent {
  channel: string;
  type: string;
  payload: unknown;
}

export interface Realtime {
  publish(event: RealtimeEvent): Promise<void>;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

export interface Mailer {
  readonly enabled: boolean;
  send(message: MailMessage): Promise<void>;
}

export type Edition = "cloud" | "offline";
