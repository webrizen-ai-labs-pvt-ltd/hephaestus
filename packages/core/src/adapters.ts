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

/**
 * Server → browser events. Channels are always org-scoped strings:
 * `org:<orgId>:<scope>` (e.g. org:…:channel:…, org:…:user:…). Payloads are
 * minimal (ids and types); browsers refetch through the authorized API.
 */
export interface Realtime {
  publish(event: RealtimeEvent): Promise<void>;
  /** In-process subscription (local dev, offline edition). Absent when a hosted service delivers events. */
  subscribe?(listener: (event: RealtimeEvent) => void): () => void;
}

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text?: string;
  /** Where replies go (the business's own address), since mail is sent from a no-reply sender. */
  replyTo?: string | null;
  /** Sender, e.g. "Sharma & Co <accounts@sharmaco.in>". Defaults to the mailer's own. */
  from?: string;
}

/** An organization's own mail server. */
export interface SmtpConfig {
  host: string;
  port: number;
  /** "ssl": TLS from the start (usually port 465); "starttls": upgrade after connecting (587). */
  security: "ssl" | "starttls";
  username: string;
  password: string;
}

export interface EmailDomainRecord {
  /** What the record is for, e.g. "SPF", "DKIM", "MX". */
  purpose: string;
  type: string;
  name: string;
  value: string;
  priority?: number;
  ttl?: string;
  status?: string;
}

export interface EmailDomain {
  id: string;
  name: string;
  /** "pending" until the DNS records are found, then "verified" (or "failed"). */
  status: "pending" | "verified" | "failed";
  records: EmailDomainRecord[];
}

/** Sending domains: an organization proves it owns a domain with DNS records, then mail goes out as it. */
export interface EmailDomains {
  create(name: string): Promise<EmailDomain>;
  get(id: string): Promise<EmailDomain>;
  /** Ask the provider to look for the DNS records again. */
  verify(id: string): Promise<EmailDomain>;
  remove(id: string): Promise<void>;
}

export interface Mailer {
  readonly enabled: boolean;
  /** The sender address, shown in settings. */
  readonly from?: string;
  send(message: MailMessage): Promise<void>;
}

export type Edition = "cloud" | "offline";
