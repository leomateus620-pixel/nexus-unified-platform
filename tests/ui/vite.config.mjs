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
const pdfFixture = readFileSync(path.join(root, "fixtures/nexus-original-isolado.pdf"));
const sparseLength = 91 * 1024 * 1024;
// Duplicate the final pointer to the existing xref after virtual padding.
const sparseTail = Buffer.from(pdfFixture.toString("latin1").match(/startxref\n\d+\n%%EOF\n$/)[0]);
const sparseTailOffset = sparseLength - sparseTail.length;
export default defineConfig({
  root,
  cacheDir: path.join(os.tmpdir(), `nexus-ui-vite-${process.env.NEXUS_UI_PORT || 4182}`),
  publicDir: path.join(app, "public"),
  optimizeDeps: { include: ["pdfjs-dist/legacy/build/pdf.min.mjs"] },
  define: {
    __NEXUS_PDF_FIXTURE__: JSON.stringify({
      sha256: createHash("sha256").update(pdfFixture).digest("hex"),
      tamanho: pdfFixture.length,
      tamanhoGrande: sparseLength,
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
          if (url.pathname === "/storage/v1/object/sign/inspecoes-acervo/fixture-grande.pdf") {
            const match = request.headers.range?.match(/^bytes=(\d+)-(\d+)$/);
            const total = sparseLength;
            if (url.searchParams.get("token") === "insp-ignore-range") {
              response.setHeader("Content-Type", "application/pdf");
              return response.end(pdfFixture);
            }
            const begin = Number(match?.[1]);
            const end = Number(match?.[2]) + 1;
            if (!match || begin >= end || end > total || end - begin > 16 * 1024 * 1024) {
              response.statusCode = 416;
              return response.end();
            }
            const bytes = Buffer.alloc(end - begin, 0x20);
            if (begin < pdfFixture.length)
              pdfFixture.copy(bytes, 0, begin, Math.min(end, pdfFixture.length));
            if (end > sparseTailOffset)
              sparseTail.copy(
                bytes,
                Math.max(0, sparseTailOffset - begin),
                Math.max(0, begin - sparseTailOffset),
                end - sparseTailOffset,
              );
            response.statusCode = 206;
            response.setHeader("Cache-Control", "no-store");
            response.setHeader("Content-Type", "application/pdf");
            response.setHeader("Content-Length", bytes.length);
            response.setHeader("Content-Range", `bytes ${begin}-${end - 1}/${total}`);
            return response.end(bytes);
          }
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
            const bytes = Buffer.from(pdfFixture);
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
          /^\.\/(?:inspecoes(?:-upload|-campo)?|acessos|continuidade|manutencao)\.functions(?:\.ts)?$/.test(
            id,
          ) &&
          /\/features\/inspecoes\//.test(importer || "")
        )
          return path.join(root, "inspecoes-server.ts");
        if (
          /\/features\/pet\/demo\/demo\.functions(?:\.ts)?$/.test(id) ||
          (id === "./demo.functions" && /\/features\/pet\/demo\//.test(importer || ""))
        )
          return path.join(root, "unit-server.ts");
        if (
          /\/features\/(?:nr\/(?:mapa\/mapa|contratacao|equipe)|pet\/(?:unidade|consulta|print))\.functions(?:\.ts)?$/.test(
            id,
          ) ||
          (/^\.\/(?:mapa(?:\/mapa)?|contratacao|equipe|unidade|consulta|print)\.functions(?:\.ts)?$/.test(
            id,
          ) &&
            /\/features\/(?:nr|pet)\//.test(importer || ""))
        )
          return path.join(root, "unit-server.ts");
        if (
          /\/features\/nr\/(?:nr|files|documents|impactos|history|technical-publication|import-inspection|document-models|calculos|import-queue|folders)\.functions(?:\.ts)?$/.test(
            id,
          ) ||
          ([
            "./nr.functions",
            "./coleta.functions",
            "./files.functions",
            "./documents.functions",
            "./impactos.functions",
            "./history.functions",
            "./technical-publication.functions",
            "./import-inspection.functions",
            "./document-models.functions",
            "./calculos.functions",
            "./import-queue.functions",
            "./folders.functions",
          ].includes(id) &&
            /\/features\/nr\//.test(importer || ""))
        )
          return path.join(root, "nr-server.ts");
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
