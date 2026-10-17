import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // Research Service of the local stack listens on 8095; point the dev proxy elsewhere with VITE_API_PROXY_TARGET.
  const apiTarget =
    loadEnv(mode, rootDir, "VITE_").VITE_API_PROXY_TARGET ||
    "http://127.0.0.1:8095";
  // Strategy Runtime of the local stack listens on 8093 and sends no CORS headers, so the browser reaches it through this proxy.
  const runtimeTarget =
    loadEnv(mode, rootDir, "VITE_").VITE_RUNTIME_PROXY_TARGET ||
    "http://127.0.0.1:8093";
  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(rootDir, "src"),
      },
    },
    server: {
      // Windows: bind IPv4 so localhost/127.0.0.1 both work (avoid [::1]-only listen).
      host: "127.0.0.1",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": {
          target: apiTarget,
          changeOrigin: true,
        },
        "/runtime-api": {
          target: runtimeTarget,
          changeOrigin: true,
          rewrite: (requestPath) => requestPath.replace(/^\/runtime-api/, ""),
        },
      },
    },
  };
});
