import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Handlers isolated from TanStack's HTTP transform; these fixtures do not prove RLS or Storage HTTP.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: { include: ["tests/estudo-arquivos.test.ts", "tests/estudo-arquivos-functions.test.ts"] },
});
