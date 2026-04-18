import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    fs: {
      allow: [path.resolve(__dirname, "../..")],
    },
    proxy: {
      "/api": {
        /** Must match apps/api listen port (default 8788). Override: API_PROXY_TARGET=http://127.0.0.1:9797 */
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8788",
        changeOrigin: true,
        timeout: 180000,
      },
    },
  },
  resolve: {
    alias: {
      "@schema": path.resolve(__dirname, "../../docs/spec-schema/app-spec.schema.json"),
    },
  },
});
