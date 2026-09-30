import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = process.env.API_URL ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // One origin in development, like production: the SPA proxies API and auth routes.
    proxy: {
      "/api": { target: api, changeOrigin: false },
      "/auth": { target: api, changeOrigin: false },
      "/webhooks": { target: api, changeOrigin: false },
    },
  },
});
