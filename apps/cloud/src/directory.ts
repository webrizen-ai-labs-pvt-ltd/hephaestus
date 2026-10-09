import type { DirectoryInviter, MemberSnapshot } from "@operant/api";
import * as client from "openid-client";
import { z } from "zod";
import type { Env } from "./env.ts";
import { getConfig } from "./oidc.ts";

/**
 * Webrizen SSO Directory API, with the app's own client-credentials tokens: members:read
 * lists an organization's members, members:invite sends invitations on a member's behalf.
 * One token per scope, so reading keeps working even if inviting isn't enabled for the app.
 */

const appTokens = new Map<string, { value: string; expiresAt: number }>();

async function getAppToken(env: Env, scope = "members:read") {
  const hit = appTokens.get(scope);
  if (hit && hit.expiresAt - 60 > Date.now() / 1000) return hit.value;
  const tokens = await client.clientCredentialsGrant(await getConfig(env), { scope });
  appTokens.set(scope, { value: tokens.access_token, expiresAt: Date.now() / 1000 + (tokens.expires_in ?? 3600) });
  return tokens.access_token;
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
    if (res.status === 401) appTokens.delete("members:read");
    if (!res.ok) throw new Error(`Directory API ${res.status}: ${await res.text()}`);
    const data = page.parse(await res.json());
    organization = data.organization;
    members.push(...data.members.map(toSnapshot));
    if (!data.has_more) break;
  }
  return { organization: organization!, members };
}

/** Invitations through Webrizen: it emails the person a link to join the organization. */
export function webrizenInviter(env: Env): DirectoryInviter {
  return {
    async invite({ organizationId, email, role, inviterUserId }) {
      let token: string;
      try {
        token = await getAppToken(env, "members:invite");
      } catch {
        return { ok: false, code: "insufficient_scope", message: "Inviting isn't enabled for Operant in Webrizen. Turn the Directory API off and on again for the app." };
      }
      const res = await fetch(`${env.WEBRIZEN_SSO_ISSUER.replace(/\/$/, "")}/directory/invitations`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
        body: JSON.stringify({ organization_id: organizationId, email, role, inviter_user_id: inviterUserId }),
      });
      if (res.status === 401) appTokens.delete("members:invite");
      const body = (await res.json().catch(() => ({}))) as { invitation?: { expires_at: string }; error?: string; error_description?: string; message?: string };
      if (res.ok && body.invitation) return { ok: true, expiresAt: body.invitation.expires_at };
      return { ok: false, code: body.error ?? String(res.status), message: body.error_description ?? body.message ?? res.statusText };
    },
  };
}
