import type { MemberSnapshot } from "@hephaestus/api";
import * as client from "openid-client";
import { z } from "zod";
import type { Env } from "./env.ts";
import { getConfig } from "./oidc.ts";

/**
 * Webrizen SSO Directory API: lists an organization's members using the app's
 * own client-credentials token (scope members:read).
 */

let appToken: { value: string; expiresAt: number } | null = null;

async function getAppToken(env: Env) {
  if (appToken && appToken.expiresAt - 60 > Date.now() / 1000) return appToken.value;
  const tokens = await client.clientCredentialsGrant(await getConfig(env), { scope: "members:read" });
  appToken = { value: tokens.access_token, expiresAt: Date.now() / 1000 + (tokens.expires_in ?? 3600) };
  return appToken.value;
}

export const directoryMember = z.object({
  user_id: z.string(),
  email: z.string(),
  name: z.string().nullable().optional(),
  image: z.string().nullable().optional(),
  roles: z.array(z.string()).default([]),
});

export const directoryOrg = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  logo: z.string().nullable().optional(),
});

const page = z.object({
  organization: directoryOrg,
  members: z.array(directoryMember),
  has_more: z.boolean(),
});

export function toSnapshot(m: z.infer<typeof directoryMember>): MemberSnapshot {
  return { userId: m.user_id, email: m.email, name: m.name ?? m.email, image: m.image ?? null, roles: m.roles };
}

export async function listAllMembers(env: Env, orgId: string) {
  const token = await getAppToken(env);
  const base = env.WEBRIZEN_SSO_ISSUER.replace(/\/$/, "");
  const members: MemberSnapshot[] = [];
  let organization: z.infer<typeof directoryOrg> | null = null;

  for (let offset = 0; ; offset += 200) {
    const url = `${base}/directory/members?organization_id=${encodeURIComponent(orgId)}&limit=200&offset=${offset}`;
    const res = await fetch(url, { headers: { authorization: `Bearer ${token}` } });
    if (res.status === 401) appToken = null;
    if (!res.ok) throw new Error(`Directory API ${res.status}: ${await res.text()}`);
    const data = page.parse(await res.json());
    organization = data.organization;
    members.push(...data.members.map(toSnapshot));
    if (!data.has_more) break;
  }
  return { organization: organization!, members };
}
