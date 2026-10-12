import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      "server-only": path("./tests/empty.ts"),
    },
  },
  test: {
    environment: "node",
    projects: [
      {
        extends: true,
        test: { name: "unit", include: ["src/**/*.test.ts"] },
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["tests/**/*.test.ts"],
          globalSetup: ["tests/global-setup.ts"],
          setupFiles: ["tests/env.ts"],
          fileParallelism: false,
        },
      },
    ],
  },
})
