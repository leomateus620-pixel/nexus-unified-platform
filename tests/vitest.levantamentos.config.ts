import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Contratos de servidor isolados da geração HTTP do TanStack, sem simular RLS.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: { include: ["tests/levantamentos.test.ts", "tests/levantamentos-functions.test.ts"] },
});
