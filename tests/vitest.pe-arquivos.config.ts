import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Boundary tests use isolated Supabase responses; they do not prove connected Auth/Storage/RLS.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: { include: ["tests/pe-arquivos-functions.test.ts"] },
});
