import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Next keeps tsconfig "jsx": "preserve"; the tests need JSX compiled so server-rendered screens can be checked.
export default defineConfig({
  oxc: { jsx: { runtime: "automatic" } },
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
});
