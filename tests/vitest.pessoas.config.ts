import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    include: [
      "tests/pessoas-functions.test.ts",
      "tests/almoxarifado-continuation.test.ts",
      "tests/equipes*.test.ts",
      "tests/qualificacoes*.test.ts",
      "tests/disponibilidade*.test.ts",
    ],
  },
});
