import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  test: {
    // Default env is node (existing suites). DOM tests opt in per-file with the
    // `// @vitest-environment jsdom` pragma (e.g. src/app/shell.test.tsx).
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
  // tsconfig uses jsx:"preserve" (Next transforms it); vitest/esbuild needs the
  // automatic runtime so .tsx test files don't require React in scope.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
