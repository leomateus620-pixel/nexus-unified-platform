import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Contratos isolados dos handlers, sem substituir os testes SQL/RLS/HTTP.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: { include: ["tests/estudos.test.ts", "tests/estudos-functions.test.ts"] },
});
