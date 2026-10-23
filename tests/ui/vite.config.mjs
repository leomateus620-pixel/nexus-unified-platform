import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import os from "node:os";

const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(process.env.NEXUS_UI_SOURCE || path.join(root, "../.."));
export default defineConfig({
  root,
  cacheDir: path.join(os.tmpdir(), `nexus-ui-vite-${process.env.NEXUS_UI_PORT || 4182}`),
  publicDir: path.join(app, "public"),
  define: {
    __NEXUS_PDF_FIXTURE__: JSON.stringify({
      sha256: createHash("sha256")
        .update(readFileSync(path.join(root, "fixtures/nexus-original-isolado.pdf")))
        .digest("hex"),
      tamanho: readFileSync(path.join(root, "fixtures/nexus-original-isolado.pdf")).length,
    }),
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      `http://127.0.0.1:${process.env.NEXUS_UI_PORT || 4182}`,
    ),
  },
  plugins: [
    {
      name: "isolated-network-boundary",
      enforce: "pre",
      configureServer(server) {
        // Synthetic PDF bytes exist only in this isolated laboratory, never app/API code.
        server.middlewares.use((request, response, next) => {
          const url = new URL(request.url || "/", "http://isolated.invalid");
          if (url.pathname !== "/storage/v1/object/sign/nexus-operacional/fixture-reader.pdf")
            return next();
          const send = () => {
            if (response.destroyed) return;
            response.setHeader("Cache-Control", "no-store");
            const flags = (url.searchParams.get("token") || "").split(".");
            if (flags.includes("expired")) {
              response.statusCode = 403;
              return response.end("Expired isolated fixture");
            }
            const bytes = Buffer.from(
              readFileSync(path.join(root, "fixtures/nexus-original-isolado.pdf")),
            );
            if (flags.includes("corrupt")) bytes[bytes.length - 20] ^= 1;
            response.setHeader("Content-Type", "application/pdf");
            response.setHeader("Content-Length", bytes.length);
            response.end(bytes);
          };
          if ((url.searchParams.get("token") || "").split(".").includes("slow"))
            setTimeout(send, 2000);
          else send();
        });
      },
      transformIndexHtml(html) {
        const rootRoute = readFileSync(path.join(app, "src/routes/__root.tsx"), "utf8");
        const font = rootRoute.match(/https:\/\/fonts.googleapis.com\/css2[^\"]+/)?.[0];
        return font
          ? html.replace("</head>", `<link rel="stylesheet" href="${font}"/></head>`)
          : html;
      },
      resolveId(id, importer) {
        if (
          /\/features\/pet\/(?:pet|documentos|retificacoes)\.functions(?:\.ts)?$/.test(id) ||
          (/^\.\/(?:pet|documentos|retificacoes)\.functions(?:\.ts)?$/.test(id) &&
            /\/features\/pet\//.test(importer || ""))
        )
          return path.join(root, "pet-server.ts");
        if (
          /\/agenda-equipe\/(?:agenda|serie-pendencias)\.functions(?:\.ts)?$/.test(id) ||
          (["./agenda.functions", "./serie-pendencias.functions"].includes(id) &&
            /\/agenda-equipe\//.test(importer || ""))
        )
          return path.join(root, "agenda-server.ts");
        if (
          /\/pessoas-competencias\/disponibilidade\/functions(?:\.ts)?$/.test(id) ||
          (id === "./functions" && /\/pessoas-competencias\/disponibilidade\//.test(importer || ""))
        )
          return path.join(root, "disponibilidade-server.ts");
        if (
          /\/pessoas-competencias\/(equipes|qualificacoes)\/functions(?:\.ts)?$/.test(id) ||
          (id === "./functions" &&
            /\/pessoas-competencias\/(equipes|qualificacoes)\//.test(importer || ""))
        )
          return path.join(root, "pessoas-competencias-server.ts");
        if (/\/almoxarifado\.functions(?:\.ts)?$/.test(id))
          return path.join(root, "almoxarifado-server.ts");
        if (/\/(levantamentos|lev-arquivos)\.functions(?:\.ts)?$/.test(id))
          return path.join(root, "levantamentos-server.ts");
        if (/\/(estudos|est-arquivos)\.functions(?:\.ts)?$/.test(id))
          return path.join(root, "estudos-server.ts");
        if (
          /\/(operacao|files|clientes|projetos-engenharia|pe-arquivos|admin)\.functions(?:\.ts)?$/.test(
            id,
          )
        )
          return path.join(root, "operacional-server.ts");
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
