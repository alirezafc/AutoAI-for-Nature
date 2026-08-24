import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    globals: true,
    // The mock provider is allowed ONLY here — never in dev/prod processes.
    env: {
      AUTOAI_ALLOW_MOCK: "1",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
