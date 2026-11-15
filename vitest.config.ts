import path from "node:path";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // video/ is its own Remotion project with its own vitest.
  test: { exclude: [...configDefaults.exclude, "video/**"] },
  resolve: {
    alias: {
      "server-only": path.resolve(__dirname, "src/test/server-only-stub.ts"),
      "@": path.resolve(__dirname, "src"),
    },
  },
});
