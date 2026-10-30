import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { nrResult } from "./nr.functions";
import { conteudoNrSchema, nrRowSchema } from "./schemas";
import { nrFileRow } from "./files.schemas";
import { NR_ARQUIVO_BUCKET, NR_ARQUIVO_MIMES, sha256Nr, validarBinarioNr } from "./files";
import {
  converterDocxNr,
  gerarDocxNr,
  NR_DOCX_CONVERSAO_VERSAO,
  NR_DOCUMENTO_RENDER_VERSAO,
  type NrDocumentAsset,
  type NrDocumentSnapshot,
} from "./documents";
import type { Norma, NrJson } from "./domain";
type Base = {
  organization_id: string;
  norma: Norma;
  documento_id: string;
  expected_version: number;
};
const db = (value: unknown) => value as SupabaseClient;
async function documento(client: SupabaseClient, input: Base) {
  const row = nrRowSchema.parse(
    nrResult(
      await client.rpc("nr_consultar", {
        p_org: input.organization_id,
        p_norma: input.norma,
        p_recurso: "documentos",
        p_filtros: { id: input.documento_id },
      }),
    ),
  );
  if (row.version !== input.expected_version)
    throw new Error("O documento mudou. Recarregue e compare antes de exportar ou converter.");
  return row;
}
async function readFile(client: SupabaseClient, row: ReturnType<typeof nrFileRow.parse>) {
  const { data: blob, error } = await client.storage.from(NR_ARQUIVO_BUCKET).download(row.caminho);
  if (error || !blob) throw new Error("Original privado indisponível no acesso atual.");
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await validarBinarioNr(bytes, row);
  return bytes;
}
export async function exportarDocumentoNr(
  value: unknown,
  input: Base & { formato: "pdf" | "docx" },
) {
  const client = db(value),
    row = await documento(client, input),
    conteudo = conteudoNrSchema.parse(row.conteudo);
  if (!conteudo.blocos.length)
    throw new Error(
      "Esta revisão não possui conteúdo nativo. Baixe o original ou converta um DOCX suportado para uma edição derivada.",
    );
  if (!row.revisao_atual_id || !row.revisao_numero)
    throw new Error("Identidade da revisão indisponível.");
  const snapshot: NrDocumentSnapshot = {
    id: row.id,
    titulo: row.titulo,
    normas: row.normas,
    estado: row.estado,
    version: row.version,
    revisao_numero: row.revisao_numero,
    revisao_id: row.revisao_atual_id,
    updated_at: row.updated_at,
    conteudo,
  };
  const ids = [
      ...new Set(
        conteudo.blocos
          .filter((b) => b.tipo === "imagem")
          .map((b) => b.arquivo_id)
          .filter((id): id is string => !!id),
      ),
    ],
    assets: NrDocumentAsset[] = [];
  let budget = 24 * 1024 * 1024;
  if (ids.length > 100)
    throw new Error("Exportação excede 100 imagens. Divida explicitamente o documento.");
  if (ids.length) {
    const rows = nrFileRow
      .array()
      .parse(
        nrResult(
          await client
            .from("nr_arquivos")
            .select("*")
            .eq("organization_id", input.organization_id)
            .in("id", ids)
            .eq("estado", "vinculado"),
        ),
      );
    if (rows.length !== ids.length)
      throw new Error(
        "Uma imagem vinculada não está disponível; nenhum arquivo foi omitido silenciosamente.",
      );
    for (const file of rows) {
      if (
        file.cliente_id !== row.cliente_id ||
        file.unidade_id !== row.unidade_id ||
        !file.mime.startsWith("image/") ||
        !file.bytes_verificados
      )
        throw new Error("Imagem incompatível com o contexto do documento.");
      if (file.tamanho > budget)
        throw new Error(
          "Imagens excedem o orçamento de exportação de 24 MiB; reduza explicitamente o documento.",
        );
      budget -= file.tamanho;
      assets.push({
        id: file.id,
        nome: file.nome,
        mime: file.mime,
        sha256: file.sha256,
        bytes: await readFile(client, file),
      });
    }
  }
  const rendered =
    input.formato === "pdf"
      ? await (await import("./documents.pdf")).gerarPdfNr(snapshot, assets)
      : await gerarDocxNr(snapshot, assets);
  if (rendered.bytes.length > 50 * 1024 * 1024)
    throw new Error("Exportação excedeu 50 MiB; divida o documento.");
  await documento(client, input);
  const nomeExportado = Array.from(row.titulo, (character) =>
    character.charCodeAt(0) < 32 || '\\/:*?"<>|'.includes(character) ? "_" : character,
  )
    .join("")
    .slice(0, 140);
  return {
    nome: `${nomeExportado}-rev${row.revisao_numero}-derivado.${input.formato}`,
    mime: input.formato === "pdf" ? NR_ARQUIVO_MIMES.pdf : NR_ARQUIVO_MIMES.docx,
    base64: Buffer.from(rendered.bytes).toString("base64"),
    sha256: await sha256Nr(rendered.bytes),
    tamanho: rendered.bytes.length,
    paginas: "paginas" in rendered ? rendered.paginas : null,
    avisos: rendered.avisos,
    tipo: "derivado_consulta" as const,
    persistido: false as const,
    versao_render: NR_DOCUMENTO_RENDER_VERSAO,
    documento_id: row.id,
    revisao_id: row.revisao_atual_id,
    documento_version: row.version,
  };
}
async function uuidKey(value: string) {
  const hash = await sha256Nr(new TextEncoder().encode(value));
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
export async function converterDocumentoNr(
  value: unknown,
  userId: string,
  input: Base & { arquivo_id: string; chave: string },
) {
  const client = db(value),
    source = await documento(client, input);
  if (
    nrResult(await client.rpc("pode", { _org: input.organization_id, _acao: "editar_nr" })) !== true
  )
    throw new Error("Seu acesso não permite criar uma edição derivada.");
  const original = nrFileRow.parse(
    nrResult(
      await client
        .from("nr_arquivos")
        .select("*")
        .eq("organization_id", input.organization_id)
        .eq("id", input.arquivo_id)
        .single(),
    ),
  );
  if (
    original.cliente_id !== source.cliente_id ||
    original.unidade_id !== source.unidade_id ||
    original.estado !== "vinculado" ||
    !original.bytes_verificados ||
    original.mime !== NR_ARQUIVO_MIMES.docx
  )
    throw new Error("Selecione um DOCX original confirmado deste documento.");
  let revisaoOrigem = original.documento_id === source.id ? original.revisao_id : null;
  if (!revisaoOrigem) {
    const bindings = z
      .array(
        z.object({
          documento_id: z.string().uuid(),
          revisao_id: z.string().uuid(),
          cliente_id: z.string().uuid(),
          unidade_id: z.string().uuid(),
        }),
      )
      .parse(
        nrResult(
          await client
            .from("nr_arquivo_vinculos")
            .select("documento_id,revisao_id,cliente_id,unidade_id")
            .eq("organization_id", input.organization_id)
            .eq("arquivo_id", original.id)
            .eq("documento_id", source.id)
            .limit(101),
        ),
      );
    if (bindings.length > 100)
      throw new Error(
        "O original possui muitos vínculos de revisão; selecione uma revisão explícita antes de converter.",
      );
    const revisions = [
      ...new Set(
        bindings
          .filter(
            (binding) =>
              binding.documento_id === source.id &&
              binding.cliente_id === source.cliente_id &&
              binding.unidade_id === source.unidade_id,
          )
          .map((binding) => binding.revisao_id),
      ),
    ];
    if (source.revisao_atual_id && revisions.includes(source.revisao_atual_id))
      revisaoOrigem = source.revisao_atual_id;
    else if (revisions.length === 1) revisaoOrigem = revisions[0]!;
    else if (revisions.length > 1)
      throw new Error(
        "O original está ligado a várias revisões históricas. Confirme a revisão de origem antes de converter.",
      );
  }
  if (!revisaoOrigem) throw new Error("Selecione um DOCX original confirmado deste documento.");
  const converted = await converterDocxNr(await readFile(client, original));
  if (
    converted.assets.length &&
    (!process.env["SUPABASE_SERVICE_ROLE_KEY"] || !process.env["SUPABASE_URL"])
  )
    throw new Error(
      "Integração não configurada: converter imagens exige a confirmação privada no servidor. O original permanece intacto.",
    );
  const trace = {
    original_arquivo_id: original.id,
    original_sha256: original.sha256,
    documento_origem_id: source.id,
    revisao_origem_id: revisaoOrigem,
    versao_dados_origem: source.version,
    conversor: NR_DOCX_CONVERSAO_VERSAO,
    avisos: converted.avisos,
  };
  const createPayload = {
    titulo: `${source.titulo.slice(0, 220)} — edição derivada`,
    descricao:
      "Edição estrutural derivada de DOCX; confira limitações e original antes de revisar.",
    tipo: source.tipo ?? "documento",
    cliente_id: source.cliente_id,
    unidade_id: source.unidade_id,
    normas: source.normas,
    recebimento: "nativo",
    dados: { conversao: { ...trace, estado: "preparada" } },
    conteudo: { schema_version: 1, blocos: [] },
  };
  const derived = nrRowSchema.parse(
    nrResult(
      await client.rpc("nr_executar", {
        p_org: input.organization_id,
        p_norma: input.norma,
        p_recurso: "documentos",
        p_comando: "salvar",
        p_id: null,
        p_expected_version: null,
        p_chave: `docx:create:${input.chave}`,
        p_dados: createPayload,
      }),
    ),
  );
  if (!derived.revisao_atual_id) throw new Error("Revisão derivada não disponível.");
  const links = new Map<string, string>(),
    imageTrace: NrJson[] = [];
  if (converted.assets.length) {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = db(supabaseAdmin);
    for (const asset of converted.assets) {
      const prepared = nrFileRow.parse(
        nrResult(
          await client.rpc("nr_arquivo_preparar", {
            p_org: input.organization_id,
            p_chave: await uuidKey(`${input.chave}:${asset.chave}:${asset.sha256}`),
            p_dados: {
              cliente_id: derived.cliente_id,
              unidade_id: derived.unidade_id,
              normas: derived.normas,
              documento_id: derived.id,
              revisao_id: derived.revisao_atual_id,
              nome: asset.nome,
              mime: asset.mime,
              tamanho: asset.bytes.length,
              sha256: asset.sha256,
              papel: "derivado",
            },
          }),
        ),
      );
      if (prepared.estado !== "vinculado") {
        if (
          nrResult(
            await client.rpc("nr_arquivo_pode_enviar", {
              p_org: input.organization_id,
              p_id: prepared.id,
            }),
          ) !== true
        )
          throw new Error("O acesso mudou durante a conversão de imagens.");
        const upload = await admin.storage
          .from(NR_ARQUIVO_BUCKET)
          .upload(prepared.caminho, asset.bytes, { contentType: asset.mime, upsert: false });
        if (upload.error && String((upload.error as { statusCode?: string }).statusCode) !== "409")
          throw new Error(
            "Não foi possível preservar uma imagem no acervo privado. A edição derivada permanece preparada para retomada.",
          );
        const { data: blob, error } = await admin.storage
          .from(NR_ARQUIVO_BUCKET)
          .download(prepared.caminho);
        if (error || !blob)
          throw new Error("Imagem transferida ainda não disponível para confirmação.");
        await validarBinarioNr(new Uint8Array(await blob.arrayBuffer()), prepared);
        nrResult(
          await admin.rpc("nr_arquivo_confirmar", {
            p_org: input.organization_id,
            p_id: prepared.id,
            p_autor: userId,
            p_sha256: prepared.sha256,
            p_tamanho: prepared.tamanho,
            p_mime: prepared.mime,
          }),
        );
      }
      links.set(asset.chave, prepared.id);
      imageTrace.push({
        arquivo_id: prepared.id,
        caminho_no_docx: asset.chave,
        sha256: asset.sha256,
      });
    }
  }
  const conteudo = conteudoNrSchema.parse({
    ...converted.conteudo,
    blocos: converted.conteudo.blocos.map((block) =>
      block.chave && links.has(block.chave)
        ? {
            id: block.id,
            tipo: "imagem",
            arquivo_id: links.get(block.chave),
            legenda: block.legenda,
          }
        : block,
    ),
  });
  // Criação de documento no contrato SQL 0038 resulta em v2 (vínculo da revisão inicial).
  // Esperar v2 fixa preserva edições posteriores em retries, inclusive resposta perdida.
  const registro = nrRowSchema.parse(
    nrResult(
      await client.rpc("nr_executar", {
        p_org: input.organization_id,
        p_norma: input.norma,
        p_recurso: "documentos",
        p_comando: "salvar",
        p_id: derived.id,
        p_expected_version: 2,
        p_chave: `docx:save:${input.chave}`,
        p_dados: {
          conteudo,
          dados: { conversao: { ...trace, estado: "convertida", imagens: imageTrace } },
        },
      }),
    ),
  );
  return {
    registro,
    avisos: converted.avisos,
    original_arquivo_id: original.id,
    tipo: "edicao_derivada" as const,
  };
}
