import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/agent/protocol.ts",
        "src/agent/context.ts",
        "src/index.ts",
        "src/config/load.ts",
        "src/agent/run.ts",
        "src/session/project.ts",
        "src/tools/registry.ts"
      ],
      exclude: ["tests/**", "dist/**"],
      thresholds: {
        lines: 75,
        statements: 75,
        branches: 65,
        functions: 75
      }
    }
  }
});
