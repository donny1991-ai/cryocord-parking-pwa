import path from "node:path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "src/test/mocks/server-only.ts"),
    },
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "jsdom",
          globals: true,
          setupFiles: ["./vitest.setup.ts"],
          include: ["src/**/*.test.{ts,tsx}"],
          exclude: ["src/**/*.integration.test.{ts,tsx}"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          globals: true,
          setupFiles: ["./vitest.integration.setup.ts"],
          include: ["src/**/*.integration.test.{ts,tsx}"],
          poolOptions: {
            threads: { singleThread: true },
            forks: { singleFork: true },
          },
          hookTimeout: 30_000,
          testTimeout: 30_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/app/**",
        "src/db/**",
        "src/test/**",
        "**/*.d.ts",
        "**/*.test.{ts,tsx}",
        "**/*.integration.test.{ts,tsx}",
      ],
    },
  },
});
