import { uuidv7 } from "@operant/core";
import { attachments, portalMessages } from "@operant/db";
import { and, desc, eq, isNull } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { AppEnv } from "../context.ts";
import { forbid, hasPermission, viewerEmployee, viewerMember } from "../helpers.ts";
import { readableMessage } from "./collab.ts";
import { requireOrg } from "../middleware.ts";
import { validate } from "../validate.ts";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Types that can execute script when opened from our origin. */
const BLOCKED_TYPES = new Set(["image/svg+xml", "text/html", "application/xhtml+xml", "application/javascript", "text/javascript"]);
const BLOCKED_EXT = /\.(svg|html?|xhtml|js|mjs)$/i;

/** Owner types with restricted files. Employee documents: HR or the employee only. */
async function assertOwnerAccess(c: Context<AppEnv>, ownerType: string, ownerId: string, write = false) {
  if (ownerType === "message") {
    // Message files follow the message: readable where the message is; only its author adds files.
    const me = await viewerMember(c);
    const msg = await readableMessage(c, ownerId, me.id);
    if (write && msg.authorId !== me.id) forbid("Only the author can attach files to a message");
    return;
  }
  if (ownerType === "portal_message") {
    // Files on the client conversation: only on your own message.
    const me = await viewerMember(c);
    const [m] = await c.get("deps").db.select({ memberId: portalMessages.memberId }).from(portalMessages).where(and(eq(portalMessages.orgId, c.get("org").id), eq(portalMessages.id, ownerId)));
    if (!m) throw new HTTPException(404, { message: "Message not found" });
    if (write && m.memberId !== me.id) forbid("Only the author can attach files to a message");
    return;
  }
  if (ownerType === "client_document" && write) forbid("Clients upload these documents from the portal");
  if (ownerType !== "employee") return;
  if (hasPermission(c, "employee", "update")) return;
  const me = await viewerEmployee(c);
  if (me?.id !== ownerId) forbid("Only HR and the employee can see these documents");
}

function safeName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(-120) || "file";
}

export const fileRoutes = new Hono<AppEnv>()
  .post(
    "/files",
    requireOrg,
    validate(
      "form",
      z.object({
        file: z.instanceof(File),
        ownerType: z.string().regex(/^[a-z_]{2,32}$/),
        ownerId: z.string().min(1).max(64),
      }),
    ),
    async (c) => {
      const { file, ownerType, ownerId } = c.req.valid("form");
      if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) {
        throw new HTTPException(413, { message: "Files must be between 1 byte and 25 MB" });
      }
      await assertOwnerAccess(c, ownerType, ownerId, true);
      const contentType = file.type || "application/octet-stream";
      if (BLOCKED_TYPES.has(contentType) || BLOCKED_EXT.test(file.name)) {
        throw new HTTPException(415, { message: "This file type isn't allowed" });
      }

      const { db, files } = c.get("deps");
      const org = c.get("org");
      const name = safeName(file.name);
      const key = `${org.id}/${ownerType}/${uuidv7()}-${name}`;
      await files.put(key, new Uint8Array(await file.arrayBuffer()), contentType);

      const [row] = await db
        .insert(attachments)
        .values({
          orgId: org.id,
          ownerType,
          ownerId,
          fileKey: key,
          name,
          contentType,
          size: file.size,
          createdBy: c.get("viewer")!.userId,
        })
        .returning();
      await audit(c, "file.uploaded", { type: ownerType, id: ownerId }, { name, size: file.size });
      return c.json({ attachment: row }, 201);
    },
  )

  .get(
    "/attachments",
    requireOrg,
    validate("query", z.object({ ownerType: z.string().regex(/^[a-z_]{2,32}$/), ownerId: z.string().min(1).max(64) })),
    async (c) => {
      const { ownerType, ownerId } = c.req.valid("query");
      await assertOwnerAccess(c, ownerType, ownerId);
      const { db } = c.get("deps");
      const rows = await db
        .select({
          id: attachments.id,
          name: attachments.name,
          contentType: attachments.contentType,
          size: attachments.size,
          createdAt: attachments.createdAt,
        })
        .from(attachments)
        .where(
          and(
            eq(attachments.orgId, c.get("org").id),
            eq(attachments.ownerType, ownerType),
            eq(attachments.ownerId, ownerId),
            isNull(attachments.deletedAt),
          ),
        )
        .orderBy(desc(attachments.createdAt));
      return c.json({ attachments: rows });
    },
  )

  .delete("/files/:id", requireOrg, async (c) => {
    const { db } = c.get("deps");
    const [row] = await db
      .select()
      .from(attachments)
      .where(and(eq(attachments.id, c.req.param("id")), eq(attachments.orgId, c.get("org").id), isNull(attachments.deletedAt)));
    if (!row) throw new HTTPException(404, { message: "File not found" });
    await assertOwnerAccess(c, row.ownerType, row.ownerId);
    if (row.createdBy !== c.get("viewer")!.userId && !hasPermission(c, "employee", "update")) forbid();
    await db.update(attachments).set({ deletedAt: new Date() }).where(eq(attachments.id, row.id));
    await audit(c, "file.deleted", { type: row.ownerType, id: row.ownerId }, { name: row.name });
    return c.json({ ok: true });
  })

  .get("/files/:id", requireOrg, async (c) => {
    const { db, files } = c.get("deps");
    const [row] = await db
      .select()
      .from(attachments)
      .where(
        and(eq(attachments.id, c.req.param("id")), eq(attachments.orgId, c.get("org").id), isNull(attachments.deletedAt)),
      );
    if (!row) throw new HTTPException(404, { message: "File not found" });
    await assertOwnerAccess(c, row.ownerType, row.ownerId);
    return c.redirect(await files.getUrl(row.fileKey, 300), 302);
  });
