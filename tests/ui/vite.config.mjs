import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import os from "node:os";

const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(process.env.NEXUS_UI_SOURCE || path.join(root, "../.."));
export default defineConfig({
  root,
  cacheDir: path.join(os.tmpdir(), `nexus-ui-vite-${process.env.NEXUS_UI_PORT || 4182}`),
  publicDir: path.join(app, "public"),
  plugins: [
    {
      name: "isolated-network-boundary",
      enforce: "pre",
      transformIndexHtml(html) {
        const rootRoute = readFileSync(path.join(app, "src/routes/__root.tsx"), "utf8");
        const font = rootRoute.match(/https:\/\/fonts.googleapis.com\/css2[^\"]+/)?.[0];
        return font
          ? html.replace("</head>", `<link rel="stylesheet" href="${font}"/></head>`)
          : html;
      },
      resolveId(id) {
        if (/\/(catalogo|custos)\.functions(?:\.ts)?$/.test(id))
          return path.join(root, "commerce-server.ts");
        if (id.endsWith("propostas.functions") || id.endsWith("propostas.functions.ts"))
          return path.join(root, "server.ts");
      },
    },
    react(),
    tailwindcss(),
  ],
  resolve: {
    dedupe: Object.keys(
      JSON.parse(readFileSync(path.resolve(root, "../../package.json"), "utf8")).dependencies,
    ),
    alias: [
      { find: "@tanstack/react-router", replacement: path.join(root, "router.tsx") },
      { find: "@tanstack/react-start", replacement: path.join(root, "server.ts") },
      { find: "@/integrations/supabase/client", replacement: path.join(root, "data.ts") },
      { find: "@/features/org/session", replacement: path.join(root, "session.ts") },
      { find: "@", replacement: path.join(app, "src") },
    ],
  },
  server: {
    host: "127.0.0.1",
    port: Number(process.env.NEXUS_UI_PORT || 4182),
    strictPort: true,
    fs: {
      allow: [app, root, path.resolve(root, "../..")],
    },
  },
});
