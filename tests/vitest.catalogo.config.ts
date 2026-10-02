import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Isolate server handlers from TanStack's HTTP code-generation plugin.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: { include: ["tests/catalogo-disponibilidade.test.ts", "tests/custos-datas.test.ts"] },
});
