import type { FileStore, Realtime } from "@operant/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SignJWT } from "jose";
import type { Env } from "./env.ts";

/** Supabase Storage (private bucket; downloads via short-lived signed URLs). */
export class SupabaseFileStore implements FileStore {
  private readonly client: SupabaseClient;

  constructor(url: string, secretKey: string, private readonly bucket: string) {
    this.client = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    const { error } = await this.client.storage.from(this.bucket).upload(key, body, { contentType, upsert: false });
    if (error) throw error;
    return { key, size: body.byteLength, contentType };
  }

  async getUrl(key: string, expiresInSeconds = 300) {
    const { data, error } = await this.client.storage.from(this.bucket).createSignedUrl(key, expiresInSeconds);
    if (error) throw error;
    return data.signedUrl;
  }

  async delete(key: string) {
    const { error } = await this.client.storage.from(this.bucket).remove([key]);
    if (error) throw error;
  }
}

/**
 * Server → browser events through Supabase Realtime's broadcast REST API.
 * Topics are always org-prefixed ("org:<id>:..."); private channels are
 * authorized by Realtime policies that check the org_id claim.
 */
export class SupabaseRealtime implements Realtime {
  constructor(private readonly url: string, private readonly secretKey: string) {}

  async publish(event: { channel: string; type: string; payload: unknown }) {
    // One topic per org ("org:<id>"): browsers subscribe once and filter by scope.
    // Payloads are ids only; anything sensitive is fetched through the API.
    const [, orgId, ...rest] = event.channel.split(":");
    const res = await fetch(`${this.url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: { "content-type": "application/json", apikey: this.secretKey, authorization: `Bearer ${this.secretKey}` },
      body: JSON.stringify({
        messages: [
          { topic: `org:${orgId}`, event: "event", payload: { scope: rest.join(":"), type: event.type, payload: event.payload }, private: true },
        ],
      }),
    });
    if (!res.ok) console.warn(`Realtime broadcast failed: ${res.status}`);
  }
}

/**
 * The "bridge": a 10-minute Supabase-compatible JWT for the signed-in member,
 * so the browser can join Realtime channels for its own org only.
 */
export async function mintSupabaseToken(env: Env, userId: string, orgId: string) {
  if (!env.SUPABASE_JWT_SECRET) throw new Error("SUPABASE_JWT_SECRET is not set");
  const expiresIn = 600;
  const token = await new SignJWT({ role: "authenticated", org_id: orgId })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(userId)
    .setAudience("authenticated")
    .setIssuedAt()
    .setExpirationTime(`${expiresIn}s`)
    .sign(new TextEncoder().encode(env.SUPABASE_JWT_SECRET));
  return { token, expiresIn };
}
