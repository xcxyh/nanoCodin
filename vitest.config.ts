import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/agent/reactLoop.ts",
        "src/index.ts",
        "src/services/configLoader.ts",
        "src/services/recoveryEngine.ts",
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
