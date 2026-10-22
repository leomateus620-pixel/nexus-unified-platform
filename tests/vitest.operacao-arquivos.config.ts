import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Transport/auth mocks exercise handler boundaries, not connected Auth, SQL/RLS or Storage HTTP.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: {
    include: [
      "tests/operacao-files.test.ts",
      "tests/operacao-arquivos-contract.test.ts",
      "tests/operacao-arquivos-functions.test.ts",
    ],
  },
});
