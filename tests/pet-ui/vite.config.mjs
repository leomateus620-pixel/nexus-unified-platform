import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
const root = path.dirname(fileURLToPath(import.meta.url));
const app = path.resolve(root, "../..");
// Dedicated, disposable DB. This lab never reads .env or a cloud connection string.
const sql = postgres({
  host: "127.0.0.1",
  port: 55439,
  database: "pet_demo",
  user: "postgres",
  prepare: false,
  max: 4,
});
export default defineConfig({
  root,
  publicDir: path.join(app, "public"),
  plugins: [
    {
      name: "real-pet-sql-lab",
      enforce: "pre",
      resolveId(id, importer) {
        if (
          /(?:pet|retificacoes|documentos|files|operacao)\.functions(?:\.ts)?$/.test(id) &&
          importer?.includes("/src/")
        )
          return path.join(root, "transport.ts");
      },
      configureServer(server) {
        server.middlewares.use("/__pet_lab", async (req, res) => {
          try {
            if (req.method !== "POST") throw Error("Somente POST");
            let body = "";
            for await (const chunk of req) {
              body += chunk;
              if (body.length > 1000000) throw Error("Payload excedido");
            }
            const { name, data } = JSON.parse(body);
            if (data.organization_id !== "a0300000-0000-4000-8000-000000000001")
              throw Error("Organização fora do laboratório");
            let result;
            await sql.begin(async (db) => {
              await db.unsafe(
                "set local role authenticated; select set_config('request.jwt.claim.sub','a0300000-0000-4000-8000-000000000002',true)",
              );
              if (name === "acesso") {
                result = {
                  gerirEquipe: true,
                  gerirOperacao: true,
                  revisarOperacao: true,
                  pessoaId: "a0300000-0000-4000-8000-000000000003",
                };
              } else if (name === "anexos") {
                const { organization_id, ...pai } = data;
                result = (
                  await db`select public.listar_anexos_operacionais(${organization_id}::uuid,${db.json(pai)}::jsonb) as r`
                )[0].r;
              } else if (name === "pet_listar")
                result = (
                  await db`select public.pet_listar(${data.organization_id}::uuid,${db.json(data.filtros || {})}::jsonb) as r`
                )[0].r;
              else if (name === "pet_opcoes")
                result = (await db`select public.pet_opcoes(${data.organization_id}::uuid) as r`)[0]
                  .r;
              else if (name === "pet_obter" || name === "pdf" || name === "pacote")
                result = (
                  await db`select public.pet_obter(${data.organization_id}::uuid,${data.id}::uuid) as r`
                )[0].r;
              else if (name === "pet_retificar")
                result = (
                  await db`select public.pet_retificar(${data.organization_id}::uuid,${db.json(data.comando)}::jsonb) as r`
                )[0].r;
              else if (name === "pet_executar")
                result = (
                  await db`select public.pet_executar(${data.organization_id}::uuid,${db.json(data.comando)}::jsonb) as r`
                )[0].r;
              else throw Error("Operação não disponível");
            });
            if (name === "pdf") {
              const { gerarPetPdf } = await server.ssrLoadModule(
                path.join(app, "src/features/pet/pdf.ts"),
              );
              const bytes = await gerarPetPdf(result);
              result = {
                base64: Buffer.from(bytes).toString("base64"),
                nome: result.pet.numero + "-relatorio.pdf",
                persistido: false,
                mensagem:
                  "Renderização local de consulta. Transporte privado não configurado neste laboratório; este arquivo não foi arquivado no servidor.",
              };
            }
            if (name === "pacote")
              throw Error(
                "Somente PET emitida e original assinado disponível podem ativar contingência. Integração não configurada.",
              );
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(result));
          } catch (e) {
            res.statusCode = 400;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: e.message, code: e.code }));
          }
        });
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
  server: { host: "127.0.0.1", port: 4193, strictPort: true, fs: { allow: [app] } },
});
