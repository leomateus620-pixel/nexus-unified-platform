// Presentation-only fixtures. No database, production session or provider is used.
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(root, "../..");
export default defineConfig({
  root,
  publicDir: path.join(app, "public"),
  plugins: [
    {
      name: "pet-presentation-only",
      enforce: "pre",
      resolveId(id, importer) {
        if (
          /(?:pet|retificacoes|documentos|files|operacao)\.functions(?:\.ts)?$/.test(id) &&
          importer?.includes("/src/")
        )
          return path.join(root, "experience-transport.ts");
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    alias: [
      { find: "@tanstack/react-router", replacement: path.join(root, "router.tsx") },
      { find: "@tanstack/react-start", replacement: path.join(root, "start.ts") },
      { find: "@/features/org/session", replacement: path.join(root, "session.ts") },
      { find: "@", replacement: path.join(app, "src") },
    ],
  },
  server: { host: "127.0.0.1", port: 4194, strictPort: true, fs: { allow: [app] } },
});
