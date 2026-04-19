import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  /** Kokoro / HF ORT WASM uses top-level await — esbuild must not target es2020 for dep scan */
  optimizeDeps: {
    esbuildOptions: {
      target: "esnext",
    },
  },
  build: {
    rollupOptions: {
      output: {
        /** ORT factory uses `new URL("ort-wasm-simd-threaded.jsep.wasm", import.meta.url)` — names must stay unhashed. */
        assetFileNames(info) {
          const base = info.names?.[0] ?? "";
          if (/^ort-wasm-simd-threaded\.jsep\.(wasm|mjs)$/.test(base)) {
            return `assets/${base}`;
          }
          return "assets/[name]-[hash][extname]";
        },
      },
    },
  },
  server: {
    fs: {
      allow: [path.resolve(__dirname, "../..")],
    },
    proxy: {
      "/api": {
        /** Must match apps/api listen port (default 8788). Override: API_PROXY_TARGET=http://127.0.0.1:9797 */
        target: process.env.API_PROXY_TARGET ?? "http://127.0.0.1:8788",
        changeOrigin: true,
        /** Builder generate-stream can run several minutes — must exceed API abort (300s) and avoid cutting SSE */
        timeout: 600000,
      },
    },
  },
  resolve: {
    alias: {
      "@schema": path.resolve(__dirname, "../../docs/spec-schema/app-spec.schema.json"),
      /** snack-sdk TransportImplWebPlayer uses `require("assert")` — Vite would leave it empty in the browser. */
      assert: path.resolve(__dirname, "src/snack/assertShim.ts"),
    },
  },
});
