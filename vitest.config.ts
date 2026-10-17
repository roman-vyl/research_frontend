import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

// vite.config.ts exports a function of the mode (it reads VITE_ env), which mergeConfig cannot merge: resolve it first.
export default defineConfig(async (env) =>
  mergeConfig(
    await viteConfig(env),
    defineConfig({
      test: {
        include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
        environment: "node",
        environmentMatchGlobs: [["src/**/*.test.tsx", "jsdom"]],
      },
      resolve: {
        alias: {
          "@": path.resolve(rootDir, "src"),
        },
      },
    }),
  ),
);
