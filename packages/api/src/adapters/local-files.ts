import { createHmac, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import type { FileStore } from "@operant/core";
import { Hono } from "hono";

/**
 * Files on the local disk: the offline edition's store, and the cloud app's
 * fallback during local development. Downloads use short-lived signed URLs
 * served by `localFileRoutes`.
 */
export class LocalFileStore implements FileStore {
  constructor(
    private readonly root: string,
    private readonly secret: string,
    private readonly publicPath = "/files",
  ) {}

  private resolve(key: string) {
    const full = path.resolve(this.root, key);
    if (!full.startsWith(path.resolve(this.root) + path.sep)) throw new Error("Invalid file key");
    return full;
  }

  sign(key: string, exp: number) {
    return createHmac("sha256", this.secret).update(`${key}\n${exp}`).digest("base64url");
  }

  verify(key: string, exp: number, sig: string) {
    if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
    const expected = Buffer.from(this.sign(key, exp));
    const given = Buffer.from(sig);
    return expected.length === given.length && timingSafeEqual(expected, given);
  }

  async put(key: string, body: Uint8Array, contentType: string) {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, body);
    await writeFile(`${full}.meta`, JSON.stringify({ contentType }));
    return { key, size: body.byteLength, contentType };
  }

  async getUrl(key: string, expiresInSeconds = 300) {
    const exp = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const params = new URLSearchParams({ key, exp: String(exp), sig: this.sign(key, exp) });
    return `${this.publicPath}?${params}`;
  }

  async delete(key: string) {
    const full = this.resolve(key);
    await rm(full, { force: true });
    await rm(`${full}.meta`, { force: true });
  }

  async read(key: string) {
    const full = this.resolve(key);
    await stat(full);
    const meta = JSON.parse(await readFile(`${full}.meta`, "utf8").catch(() => "{}")) as { contentType?: string };
    return { body: await readFile(full), contentType: meta.contentType ?? "application/octet-stream" };
  }
}

/** Serves signed local downloads. Mount at the store's publicPath. */
export function localFileRoutes(store: LocalFileStore) {
  return new Hono().get("/", async (c) => {
    const key = c.req.query("key") ?? "";
    const exp = Number(c.req.query("exp"));
    const sig = c.req.query("sig") ?? "";
    if (!store.verify(key, exp, sig)) return c.text("Link expired", 403);
    try {
      const file = await store.read(key);
      const name = path.basename(key).replace(/^[0-9a-f-]{36}-/, "");
      return c.body(file.body, 200, {
        "content-type": file.contentType,
        "content-disposition": `inline; filename="${name.replace(/"/g, "")}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=300",
      });
    } catch {
      return c.text("Not found", 404);
    }
  });
}
