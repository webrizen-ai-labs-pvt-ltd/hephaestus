import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const api = process.env.API_URL ?? "http://localhost:8787";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5175,
    // The portal talks to the same API, through its own origin.
    proxy: { "/api": { target: api, changeOrigin: false } },
  },
});
