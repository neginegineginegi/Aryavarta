import path from "node:path";
import { defineConfig } from "vitest/config";

// `.mts`, not `.ts`: package.json has no "type": "module", so a `.ts` config
// is loaded as CommonJS and Vite 8 warns that ESM syntax and `__dirname` in
// it will break under the native config loader it is moving to.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
  },
});
