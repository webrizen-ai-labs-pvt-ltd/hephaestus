import { getRequestListener } from "@hono/node-server";
import { createCloudApp } from "./app.ts";
import { loadEnv } from "./env.ts";

/** Production entry: a Vercel Node.js function (bundled by scripts/build-vercel.mjs). */
const app = await createCloudApp(loadEnv());

export default getRequestListener(app.fetch);
