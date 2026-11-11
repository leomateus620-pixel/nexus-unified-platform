import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwind from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import postgres from "postgres";
import { ids, options } from "./fixture.mjs";
const root = path.dirname(fileURLToPath(import.meta.url)),
  app = path.resolve(root, "../..");
const database = process.env.NEXUS_COTRIROSA_LAB_DB || "cotrirosa_lab";
if (!/^cotrirosa_(lab|test_\d+)$/.test(database)) throw Error("Banco fora do laboratório");
const sql = postgres({ ...options(), database, max: 4 });
export default defineConfig({
  root,
  publicDir: path.join(app, "public"),
  plugins: [
    {
      name: "isolated-real-sql-transport",
      enforce: "pre",
      resolveId(id, importer) {
        if (/(?:\.|\/)functions(?:\.ts)?$/.test(id) && importer?.includes("/src/"))
          return (
            "\0cotrirosa:" +
            (id.startsWith("@/")
              ? path.join(app, "src", id.slice(2))
              : path.resolve(path.dirname(importer), id))
          );
      },
      load(id) {
        if (!id.startsWith("\0cotrirosa:")) return;
        let p = id.slice(11);
        if (!p.endsWith(".ts")) p += ".ts";
        const text = readFileSync(p, "utf8");
        const names = [...text.matchAll(/export (?:async )?(?:const|function) (\w+)/g)].map(
          (m) => m[1],
        );
        return (
          `import {rpc} from ${JSON.stringify(path.join(root, "transport.ts"))};` +
          names.map((n) => `export const ${n} = o => rpc('${n}',o);`).join("\n")
        );
      },
      configureServer(server) {
        server.middlewares.use("/__cotrirosa", async (req, res) => {
          try {
            if (
              req.method !== "POST" ||
              (req.headers.origin &&
                !/^http:\/\/(127\.0\.0\.1|localhost):4196$/.test(req.headers.origin))
            )
              throw Error("Laboratório restrito a loopback");
            let body = "";
            for await (const chunk of req) {
              body += chunk;
              if (body.length > 1000000) throw Error("Payload excedido");
            }
            const { name, data } = JSON.parse(body);
            if ((data.organization_id ?? data.org) !== ids.org)
              throw Error("Organização fora da fixture");
            let r;
            await sql.begin(async (db) => {
              await db`select set_config('request.jwt.claim.sub',${ids.user},true)`;
              await db.unsafe("set local role authenticated");
              const {
                organization_id: org = data.org,
                norma = "NR33",
                recurso,
                operacao,
                ...filters
              } = data;
              if (name === "nrConsultar") {
                r = (
                  await db`select nr_consultar(${org},${norma},${recurso},${db.json(filters)}) r`
                )[0].r;
                if (recurso === "contexto")
                  r.clientes = r.clientes.map((c) => ({
                    ...c,
                    nome: c.nome ?? c.nome_exibicao ?? c.razao_social,
                  }));
                else if (data.id && !r.registro) r = { registro: r };
              } else if (name === "nrExecutar") {
                r = (
                  await db`select nr_executar(${org},${norma},${recurso},${data.comando},${data.id ?? null},${data.expected_version ?? null},${data.chave},${db.json(data.dados)}) r`
                )[0].r;
                if (!r.registro) r = { registro: r };
              } else if (name === "nrColetaSalvar") {
                r = (
                  await db`select nr_coleta_salvar(${org},${data.cliente},${data.unidade},${norma},${data.id},${data.version},${data.chave},${db.json({ bloco: data.bloco, respostas: data.respostas, medidas: data.medidas, identificacao_verificada: data.identificacao_verificada })}) r`
                )[0].r;
                if (!r.registro) r = { registro: r };
              } else if (name === "nrDocumentoExportar" || name === "nrColetaPdfGerar") {
                const doc = (
                  await db`select nr_consultar(${org},${norma},'documentos',${db.json({ id: data.documento_id })}) r`
                )[0].r;
                if (doc.version !== data.expected_version) throw Error("Documento mudou.");
                const { gerarPdfNr } = await server.ssrLoadModule(
                  path.join(app, "src/features/nr/documents.pdf.ts"),
                );
                const pdf = await gerarPdfNr({ ...doc, revisao_id: doc.revisao_atual_id });
                r = {
                  base64: Buffer.from(pdf.bytes).toString("base64"),
                  mime: "application/pdf",
                  nome: `relatorio-${doc.id}.pdf`,
                };
              } else if (name === "nrColetaListar") {
                r = (
                  await db`select nr_coleta_listar(${org},${data.cliente},${data.unidade},${norma},${db.json({ busca: data.busca, estado: data.estado, pagina: data.pagina, local_id: data.local ?? null })}) r`
                )[0].r;
              } else if (name === "nrColetaContexto") {
                r = (
                  await db`select nr_coleta_contexto(${org},${data.cliente},${data.unidade},${norma},${data.local ?? null},${data.busca ?? ""},${data.pagina ?? 0}) r`
                )[0].r;
              } else if (name === "nrColetaIniciar") {
                r = (
                  await db`select nr_coleta_iniciar(${org},${data.cliente},${data.unidade},${norma},${data.local},${data.modelo},${data.modeloVersion},${data.duplo},${data.origem},${data.chave},${data.reinspecao ?? false}) r`
                )[0].r;
              } else if (name === "nrColetaRevisoes") {
                r = (
                  await db`select nr_coleta_revisoes_listar(${org},${data.cliente},${data.unidade},${norma},${data.id}) r`
                )[0].r;
              } else if (name === "nrColetaConcluir") {
                r = (
                  await db`select nr_coleta_concluir(${org},${data.cliente},${data.unidade},${norma},${data.id},${data.version},${data.chave}) r`
                )[0].r;
              } else if (name === "nrColetaRevisar") {
                r = (
                  await db`select nr_coleta_revisar(${org},${data.cliente},${data.unidade},${norma},${data.id},${data.revisao},${data.version},${data.decisao},${data.motivo},${data.chave},${db.json(data.itens ?? [])}) r`
                )[0].r;
              } else if (name === "nrColetaSnapshot") {
                r = (
                  await db`select nr_coleta_snapshot(${org},${data.cliente},${data.unidade},${norma},${data.id},${data.revisao}) r`
                )[0].r;
              } else if (name === "nrColetaDocumento") {
                r = (
                  await db`select nr_coleta_documento(${org},${data.cliente},${data.unidade},${norma},${data.id},${data.revisao},${data.modelo},${data.modeloVersion},${data.modeloVersao}) r`
                )[0].r;
              } else if (name === "nrContratacaoObter") {
                r = (
                  await db`select nr_contratacao_obter(${org},${data.cliente_id},${data.unidade_id},${norma}) r`
                )[0].r;
              } else if (name === "nrContratacaoSalvar") {
                r = (
                  await db`select nr_contratacao_salvar(${org},${data.cliente_id},${data.unidade_id},${norma},${data.expected_version},${data.chave},${data.documentos},${data.fonte}) r`
                )[0].r;
              } else if (name === "petFormularioBranco") {
                const unit = (
                  await db`select pet_contexto_unidade(${org},${data.cliente_id},${data.unidade_id},${norma}) r`
                )[0].r;
                if (!unit.pode_consultar || !unit.modelos.some((m) => m.id === data.modelo_id))
                  throw Error("Modelo aprovado indisponível neste contexto.");
                const contract = (
                  await db`select nr_contratacao_obter(${org},${data.cliente_id},${data.unidade_id},${norma}) r`
                )[0].r;
                if (!contract.confirmada || !contract.documentos.includes("pet"))
                  throw Error("Confirme a contratação da PET com o responsável técnico.");
                const options = (await db`select pet_opcoes(${org}) r`)[0].r;
                const model = options.modelos.find(
                  (m) => m.id === data.modelo_id && m.estado === "aprovado",
                );
                const renderer = await server.ssrLoadModule(
                  path.join(app, "src/features/pet/print.ts"),
                );
                if (!model || !renderer.petPrintProcedure.safeParse(model.procedimento).success)
                  throw Error(
                    "Layout de impressão ainda não aprovado nesta versão. O RT deve conferir o layout antes de publicar o modelo.",
                  );
                r = {
                  base64: Buffer.from(await renderer.petBlankPdf(model, data.vias)).toString(
                    "base64",
                  ),
                  nome: "PET-formulario-em-branco.pdf",
                };
              } else if (name === "buscarOpcoesQualificacao" && data.tipo === "pessoas") {
                const rows =
                  await db`select id,nome,'Pessoa operacional ativa' contexto from pessoas where organization_id=${org} and ativa and nome ilike ${"%" + (data.busca ?? "") + "%"} order by nome,id limit 25 offset ${(data.pagina ?? 0) * 25}`;
                r = { rows, total: rows.length };
              } else if (name === "nrUnidadeEquipe") {
                r = (
                  await db`select nr_unidade_equipe(${org},${data.cliente_id},${data.unidade_id},${norma},${data.pagina ?? 0},${data.busca ?? ""}) r`
                )[0].r;
              } else if (name === "nrUnidadePessoaSalvar") {
                r = (
                  await db`select nr_unidade_pessoa_salvar(${org},${data.cliente_id},${data.unidade_id},${norma},${data.pessoa_id},${data.funcao},${data.ativa},${data.expected_version},${data.chave}) r`
                )[0].r;
              } else if (name === "petFotosListar") {
                r = (await db`select pet_fotos_listar(${org},${data.pet_id}) r`)[0].r;
              } else if (name === "petFotoRegistrar") {
                r = (
                  await db`select pet_foto_registrar(${org},${data.pet_id},${data.anexo_id},${data.expected_version},${data.chave},${db.json(data.dados)}) r`
                )[0].r;
              } else if (name === "petExportarUnidade") {
                r = (
                  await db`select pet_exportar_unidade(${org},${data.cliente_id},${data.unidade_id},${norma},${db.json(data.filtros)}) r`
                )[0].r;
              } else if (name === "nrMapaContexto") {
                r = (
                  await db`select nr_mapa_contexto(${org},${data.cliente_id},${data.unidade_id},${norma}) r`
                )[0].r;
                if (r.cena && data.manifesto)
                  r.manifest = (
                    await server.ssrLoadModule(
                      path.join(app, "src/features/nr/mapa/cotrirosa.server.ts"),
                    )
                  ).cotrirosa;
              } else if (name === "petDemoContexto")
                r = (
                  await db`select pet_demo_contexto(${org},${data.cliente_id},${data.unidade_id},${norma},${data.local_id ?? null}) r`
                )[0].r;
              else if (name === "petDemoListar")
                r = (
                  await db`select pet_demo_listar(${org},${data.cliente_id},${data.unidade_id},${norma},${data.local_id ?? null},${data.busca ?? ""},${data.grupo ?? "andamento"},${data.pagina ?? 0}) r`
                )[0].r;
              else if (name === "petDemoObter")
                r = (await db`select pet_demo_obter(${org},${data.id},${norma}) r`)[0].r;
              else if (name === "petDemoRegistros")
                r = (
                  await db`select pet_demo_registros(${org},${data.id},${norma},${data.recurso},${data.pagina ?? 0}) r`
                )[0].r;
              else if (name === "petDemoExecutar")
                r = (await db`select pet_demo_executar(${org},${db.json(data.comando)}) r`)[0].r;
              else if (name === "petContextoUnidade")
                r = (
                  await db`select pet_contexto_unidade(${org},${data.cliente_id},${data.unidade_id},${norma},${data.local_id ?? null}) r`
                )[0].r;
              else if (name === "petListar")
                r = (await db`select pet_listar(${org},${db.json(data.filtros ?? {})}) r`)[0].r;
              else if (name === "petOpcoes") r = (await db`select pet_opcoes(${org}) r`)[0].r;
              else if (name === "petObter")
                r = (await db`select pet_obter(${org},${data.id}) r`)[0].r;
              else if (name === "petExecutar")
                r = (await db`select pet_executar(${org},${db.json(data.comando)}) r`)[0].r;
              else if (name === "consultarAcessoOperacional")
                r = {
                  gerirEquipe: true,
                  gerirOperacao: true,
                  revisarOperacao: true,
                  pessoaId: ids.person,
                };
              else if (name === "nrFotoOcorrenciasLer")
                r = (await db`select nr_foto_ocorrencias_ler(${org},${data.local_id}) r`)[0].r;
              else if (name === "nrArquivoLimites")
                r = (await db`select nr_arquivo_limites(${org}) r`)[0].r;
              else if (name === "nrArquivosListar")
                r = (await db`select nr_arquivo_listar(${org},${norma},${db.json(filters)}) r`)[0]
                  .r;
              else if (name === "nrHistoricoListar")
                r = (
                  await db`select nr_historico_listar(${org},${norma},${recurso},${data.registro_id},${data.pagina ?? 0},${data.limite ?? 20}) r`
                )[0].r;
              else if (name === "nrRevisoesListar")
                r = (
                  await db`select nr_revisoes_listar(${org},${norma},${recurso},${data.registro_id},${data.pagina ?? 0},${data.limite ?? 20}) r`
                )[0].r;
              else if (name === "listarAnexos")
                r = (await db`select listar_anexos_operacionais(${org},${db.json(filters)}) r`)[0]
                  .r;
              else throw Error("Integração não configurada neste laboratório: " + name);
            });
            res.setHeader("Content-Type", "application/json");
            res.setHeader("Cache-Control", "no-store");
            res.end(JSON.stringify(r));
          } catch (e) {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: e.message, code: e.code }));
          }
        });
      },
    },
    react(),
    tailwind(),
  ],
  resolve: {
    alias: [
      { find: "@tanstack/react-start", replacement: path.join(app, "tests/pet-ui/start.ts") },
      { find: "@/features/org/session", replacement: path.join(app, "tests/pet-ui/session.ts") },
      { find: "@/integrations/supabase/client", replacement: path.join(app, "tests/ui/data.ts") },
      { find: "@", replacement: path.join(app, "src") },
    ],
  },
  server: { host: "127.0.0.1", port: 4196, strictPort: true, fs: { allow: [app] } },
  build: { outDir: "dist", copyPublicDir: false, sourcemap: false },
});
