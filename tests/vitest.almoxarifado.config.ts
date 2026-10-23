import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Fronteiras Zod/handlers isoladas; não substitui SQL, Auth ou Storage reais.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    include: [
      "tests/almoxarifado.test.ts",
      "tests/almoxarifado-functions.test.ts",
      "tests/almoxarifado-continuation.test.ts",
    ],
  },
});
