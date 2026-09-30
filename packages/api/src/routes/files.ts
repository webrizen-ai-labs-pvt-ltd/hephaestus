import { uuidv7 } from "@hephaestus/core";
import { attachments } from "@hephaestus/db";
import { and, eq, isNull } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { audit } from "../audit.ts";
import type { AppEnv } from "../context.ts";
import { requireOrg } from "../middleware.ts";
import { validate } from "../validate.ts";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

/** Types that can execute script when opened from our origin. */
const BLOCKED_TYPES = new Set(["image/svg+xml", "text/html", "application/xhtml+xml", "application/javascript", "text/javascript"]);
const BLOCKED_EXT = /\.(svg|html?|xhtml|js|mjs)$/i;

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

  .get("/files/:id", requireOrg, async (c) => {
    const { db, files } = c.get("deps");
    const [row] = await db
      .select()
      .from(attachments)
      .where(
        and(eq(attachments.id, c.req.param("id")), eq(attachments.orgId, c.get("org").id), isNull(attachments.deletedAt)),
      );
    if (!row) throw new HTTPException(404, { message: "File not found" });
    return c.redirect(await files.getUrl(row.fileKey, 300), 302);
  });
