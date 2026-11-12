import { assinarMarcas } from "@/features/clientes/marca.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  inspecoesRecursos,
  pareceresLevantamento,
  respostasLevantamento,
  tiposLevantamento,
  type InspecoesArquivo,
  type InspecoesAtribuicao,
  type InspecoesContexto,
  type InspecoesDetalhe,
  type InspecoesEscopo,
  type InspecoesFiltro,
  type InspecoesLevantamento,
  type InspecoesLevantamentos,
  type InspecoesLista,
  type InspecoesPainel,
  type InspecoesObjeto,
  type InspecoesRegistro,
  type InspecoesUnidade,
} from "./ui-contract";

const client = (value: unknown) => value as SupabaseClient;
const bucket = "inspecoes-acervo";
const pageSize = 24;
const uuid = z.string().uuid();
const scope = z.object({
  organizationId: uuid,
  clienteId: uuid.optional(),
  unidadeId: uuid.optional(),
});
const collection = z.enum(inspecoesRecursos);
const filter = scope.extend({
  recurso: collection,
  busca: z.string().trim().max(100),
  estado: z
    .string()
    .regex(/^[a-z0-9_]*$/)
    .max(50),
  pagina: z.number().int().min(0).max(10000),
  ordem: z.enum(["recente", "nome"]),
});
const detail = scope.extend({ recurso: collection, id: uuid });
const civilDate = z.string().date();

function dataOrThrow<T>(result: {
  data: T;
  error: { code?: string; message: string; details?: string } | null;
}): T {
  if (!result.error) return result.data;
  const { code, message } = result.error;
  if (code === "40001")
    throw new Error(
      "O registro mudou durante a edição. Compare as versões antes de salvar novamente.",
    );
  if (code === "42501" || code === "23503" || code === "PGRST116")
    throw new Error("Registro indisponível no contexto autorizado.");
  if (["PGRST202", "PGRST205", "42P01", "42883"].includes(code ?? ""))
    throw new Error("Integração não configurada para Inspeções nesta versão do banco.");
  if (["22023", "23514", "23505"].includes(code ?? ""))
    throw new Error(
      result.error.details && code === "23514"
        ? [message, result.error.details].join("\n")
        : message,
    );
  throw new Error("Não foi possível consultar ou salvar o registro de Inspeções.");
}

async function checkScope(db: SupabaseClient, query: InspecoesEscopo) {
  if (query.clienteId && !query.unidadeId) {
    const result = await db
      .from("inspecoes_contextos")
      .select("unidade_id")
      .eq("organization_id", query.organizationId)
      .eq("cliente_id", query.clienteId)
      .limit(1);
    if (dataOrThrow(result)?.length) return;
    throw new Error("Você não tem uma atribuição de Inspeções para este cliente.");
  }
  if (query.unidadeId && !query.clienteId) throw new Error("Selecione o cliente da unidade.");
  const allowed = dataOrThrow(
    await db.rpc("inspecoes_pode", {
      p_org: query.organizationId,
      p_cliente: query.clienteId ?? null,
      p_unidade: query.unidadeId ?? null,
      p_capacidade: "consultar",
    }),
  );
  if (allowed !== true) throw new Error("Você não tem uma atribuição de Inspeções neste contexto.");
}

export const inspecoesContexto = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope.pick({ organizationId: true }))
  .handler(async ({ context, data }): Promise<InspecoesContexto> => {
    const db = client(context.supabase);
    const [access, contexts] = await Promise.all([
      db.rpc("inspecoes_acesso", { p_org: data.organizationId }),
      db.rpc("inspecoes_contexto", { p_org: data.organizationId }),
    ]);
    const atribuicoes = (dataOrThrow(access) ?? []) as InspecoesAtribuicao[];
    const unidades = (dataOrThrow(contexts) ?? []) as InspecoesUnidade[];
    const marcas = await assinarMarcas(db, [
      ...new Map(
        unidades.map((row) => [row.cliente_id, { id: row.cliente_id, marca: row.marca }]),
      ).values(),
    ]);
    const marcaById = new Map(marcas.map((marca) => [marca.id, marca.marca]));
    return {
      atribuicoes,
      unidades: unidades.map((row) => ({ ...row, marca: marcaById.get(row.cliente_id) ?? null })),
    };
  });

const orgCollections = new Set([
  "servicos",
  "familias",
  "tipos",
  "pacotes",
  "matrizes",
  "regras",
  "parametros",
  "textos",
  "listas",
  "configuracoes",
  "equipamentos",
  "registro",
]);
const recordColumns =
  "id,cliente_id,unidade_id,colecao,source_id,titulo,codigo,familia,situacao,data_ref,vigente,existente";
const detailColumns =
  recordColumns + ",snapshot,origem_autor,origem_data,importado_em,levantamento_id,ativo_id";
const summaryKeys = [
  "revisao",
  "local",
  "setor",
  "zona_laudo",
  "resultado",
  "criticidade",
  "validade",
  "segmento",
  "situacao",
  "observacao",
  "estado",
  "familias",
] as const;
const cardColumns = [recordColumns, ...summaryKeys.map((key) => `s_${key}:snapshot->${key}`)].join(
  ",",
);

function cards(rows: unknown[]): InspecoesRegistro[] {
  return rows.map((value) => {
    const row = value as InspecoesRegistro &
      Record<`s_${(typeof summaryKeys)[number]}`, InspecoesObjeto[string]>;
    const resumo = Object.fromEntries(summaryKeys.map((key) => [key, row[`s_${key}`]]));
    const base = Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith("s_")));
    return { ...base, resumo } as InspecoesRegistro;
  });
}

async function enrichR64(db: SupabaseClient, organizationId: string, rows: InspecoesRegistro[]) {
  const ids = rows
    .filter((row) => row.colecao === "ativos" || row.colecao === "documentos")
    .map(({ id }) => id);
  if (!ids.length) return rows;
  const projections = (dataOrThrow(
    await db.rpc("inspecoes_r64_projecoes", {
      p_org: organizationId,
      p_ids: ids,
    }),
  ) ?? []) as { registro_id: string; r64_status: string; vence: string }[];
  const values = new Map(projections.map(({ registro_id, ...rest }) => [registro_id, rest]));
  return rows.map((row) => ({ ...row, resumo: { ...row.resumo, ...values.get(row.id) } }));
}

async function groupDetail(
  db: SupabaseClient,
  input: z.infer<typeof detail>,
): Promise<InspecoesDetalhe> {
  const today = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(
    new Date(),
  );
  let query = db
    .rpc("inspecoes_r64_grupos", { p_org: input.organizationId, p_hoje: today })
    .eq("id", input.id);
  if (input.clienteId) query = query.eq("cliente_id", input.clienteId);
  if (input.unidadeId) query = query.eq("unidade_id", input.unidadeId);
  const group = dataOrThrow(await query.single()) as InspecoesObjeto;
  const documentId = group["documento_id"];
  const document =
    typeof documentId === "string"
      ? dataOrThrow(
          await db
            .from("inspecoes_acervo_consulta")
            .select(cardColumns)
            .eq("organization_id", input.organizationId)
            .eq("colecao", "documentos")
            .eq("id", documentId)
            .maybeSingle(),
        )
      : null;
  const relacionados = document ? cards([document]) : [];
  return {
    registro: {
      id: input.id,
      source_id: input.id,
      colecao: "vencimentos",
      vigente: true,
      existente: true,
      cliente_id: String(group["cliente_id"]),
      unidade_id: String(group["unidade_id"]),
      titulo: relacionados[0]?.titulo ?? "Reinspeção da unidade",
      codigo: relacionados[0]?.codigo ?? null,
      familia: null,
      situacao: String(group["situacao"]),
      data_ref: String(group["vence"]),
      snapshot: group,
    },
    relacionados,
    arquivos: [],
  };
}

async function list(db: SupabaseClient, input: InspecoesFiltro): Promise<InspecoesLista> {
  if (input.recurso === "vencimentos") {
    const response = dataOrThrow(
      await db.rpc("inspecoes_r64_listar", {
        p_org: input.organizationId,
        p_cliente: input.clienteId ?? null,
        p_unidade: input.unidadeId ?? null,
        p_estado: input.estado || null,
        p_busca: input.busca,
        p_offset: input.pagina * pageSize,
        p_limite: pageSize,
      }),
    );
    return { ...(response as Pick<InspecoesLista, "items" | "total">), pageSize };
  }

  let query = db
    .from("inspecoes_acervo_consulta")
    .select(cardColumns, { count: "exact" })
    .eq("organization_id", input.organizationId)
    .eq("colecao", input.recurso);
  if (!orgCollections.has(input.recurso)) {
    if (input.clienteId) query = query.eq("cliente_id", input.clienteId);
    if (input.unidadeId) query = query.eq("unidade_id", input.unidadeId);
  }
  if (input.recurso === "ativos" && ["", "vigentes"].includes(input.estado))
    query = query.eq("vigente", true).eq("existente", true);
  if (input.estado && !["todos", "vigentes"].includes(input.estado))
    query = query.eq("situacao", input.estado);
  const search = input.busca.replace(/[^\p{L}\p{N}\p{M}\s./#_-]/gu, " ").trim();
  if (search) {
    const escaped = search.replaceAll("_", "\\_");
    query = query.or(
      `titulo.ilike.%${escaped}%,codigo.ilike.%${escaped}%,familia.ilike.%${escaped}%`,
    );
  }
  if (input.ordem === "recente")
    query = query.order("data_ref", { ascending: false, nullsFirst: false });
  query = query.order("titulo").order("id");
  const offset = input.pagina * pageSize;
  const response = await query.range(offset, offset + pageSize - 1);
  return {
    items: await enrichR64(db, input.organizationId, cards(dataOrThrow(response) ?? [])),
    total: response.count ?? 0,
    pageSize,
  };
}

export const inspecoesListar = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(filter)
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    await checkScope(db, data);
    return list(db, data);
  });

export const inspecoesPainel = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(scope)
  .handler(async ({ context, data }): Promise<InspecoesPainel> => {
    const db = client(context.supabase);
    await checkScope(db, data);
    const indicadores = [
      { recurso: "documentos", estado: "", label: "Documentos" },
      { recurso: "ativos", estado: "vigentes", label: "Ativos vigentes" },
      { recurso: "pendencias", estado: "", label: "Pendências registradas" },
      { recurso: "vencimentos", estado: "vencido", label: "Grupos vencidos · R64" },
      { recurso: "vencimentos", estado: "em_aviso", label: "Grupos em aviso · R64" },
    ] as const;
    const lists = await Promise.all(
      indicadores.map((item) =>
        list(db, {
          ...data,
          ...item,
          busca: "",
          pagina: 0,
          ordem: "recente",
        }),
      ),
    );
    return {
      indicadores: indicadores.map((item, index) => ({ ...item, total: lists[index]?.total ?? 0 })),
      recentes: lists[0]?.items.slice(0, 6) ?? [],
    };
  });

const fileVariant = z.enum(["original", "miniatura_384", "previa_768"]);
type FileVariant = z.infer<typeof fileVariant>;
type FileRow = InspecoesArquivo & {
  caminho: string | null;
  miniatura_caminho: string | null;
  previa_caminho: string | null;
};

function filePath(arquivo: FileRow, variant: FileVariant) {
  if (!["original_verificado", "falha_processamento"].includes(arquivo.estado)) return null;
  return variant === "original"
    ? arquivo.caminho
    : variant === "miniatura_384"
      ? arquivo.miniatura_caminho
      : arquivo.previa_caminho;
}

async function signedFile(db: SupabaseClient, arquivo: FileRow, variant: FileVariant) {
  const path = filePath(arquivo, variant);
  if (!path) return null;
  const response = await db.storage.from(bucket).createSignedUrl(path, 300);
  return response.data?.signedUrl ?? null;
}

export const inspecoesArquivoUrl = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ organizationId: uuid, id: uuid, variante: fileVariant }))
  .handler(async ({ context, data }) => {
    const db = client(context.supabase);
    const row = dataOrThrow(
      await db
        .from("inspecoes_arquivos")
        .select("*")
        .eq("organization_id", data.organizationId)
        .eq("id", data.id)
        .single(),
    ) as FileRow;
    const url = await signedFile(db, row, data.variante);
    if (!url) throw new Error("Arquivo privado ou variante indisponível.");
    return { url };
  });

export const inspecoesDetalhe = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(detail)
  .handler(async ({ context, data }): Promise<InspecoesDetalhe> => {
    const db = client(context.supabase);
    await checkScope(db, data);
    if (data.recurso === "vencimentos") return groupDetail(db, data);
    let lookup = db
      .from("inspecoes_acervo_consulta")
      .select(detailColumns)
      .eq("organization_id", data.organizationId)
      .eq("colecao", data.recurso)
      .eq("id", data.id);
    if (!orgCollections.has(data.recurso)) {
      if (data.clienteId) lookup = lookup.eq("cliente_id", data.clienteId);
      if (data.unidadeId) lookup = lookup.eq("unidade_id", data.unidadeId);
    }
    const projected = dataOrThrow(
      await lookup.single(),
    ) as unknown as InspecoesDetalhe["registro"] & {
      levantamento_id: string | null;
      ativo_id: string | null;
    };
    const { levantamento_id, ativo_id, ...registro } = projected;
    const fileLookup = db
      .from("inspecoes_arquivos")
      .select("*")
      .eq("organization_id", data.organizationId);
    const attached = levantamento_id
      ? fileLookup.eq("levantamento_id", levantamento_id)
      : fileLookup.eq("registro_id", data.id);
    if (levantamento_id) {
      const history = dataOrThrow(
        await db
          .from("inspecoes_emissoes")
          .select("revisao,emitido_em,sha256")
          .eq("organization_id", data.organizationId)
          .eq("documento_id", data.id)
          .order("emitido_em", { ascending: false })
          .limit(100),
      );
      registro.snapshot["historico"] = history ?? [];
    }
    const [relationsResponse, filesResponse] = await Promise.all([
      db
        .from("inspecoes_relacoes")
        .select("origem_id,destino_id")
        .eq("organization_id", data.organizationId)
        .or(`origem_id.eq.${data.id},destino_id.eq.${data.id}`)
        .order("origem_id")
        .order("destino_id")
        .limit(1000),
      attached.order("ordem").order("id").limit(200),
    ]);
    const relations = dataOrThrow(relationsResponse) ?? [];
    const ids = [
      ...new Set(
        relations.map((row) => (row.origem_id === data.id ? row.destino_id : row.origem_id)),
      ),
    ];
    if (ativo_id && !ids.includes(ativo_id)) ids.push(ativo_id);
    const arquivos = (dataOrThrow(filesResponse) ?? []) as FileRow[];
    const thumbPaths = arquivos.flatMap((arquivo) => {
      const path = filePath(arquivo, "miniatura_384");
      return path ? [path] : [];
    });
    const batches = Array.from({ length: Math.ceil(ids.length / 75) }, (_, index) =>
      ids.slice(index * 75, index * 75 + 75),
    );
    const [relatedResponses, thumbsResponse] = await Promise.all([
      Promise.all(
        batches.map((batch) =>
          db
            .from("inspecoes_acervo_consulta")
            .select(cardColumns)
            .eq("organization_id", data.organizationId)
            .in("id", batch),
        ),
      ),
      thumbPaths.length ? db.storage.from(bucket).createSignedUrls(thumbPaths, 300) : null,
    ]);
    const thumbnails = new Map(thumbsResponse?.data?.map((row) => [row.path, row.signedUrl]));
    const relacionados = await enrichR64(
      db,
      data.organizationId,
      cards(relatedResponses.flatMap((response) => dataOrThrow(response) ?? [])),
    );
    relacionados.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR", { numeric: true }));
    const [projection] = await enrichR64(db, data.organizationId, [registro]);
    return {
      registro: { ...registro, resumo: projection?.resumo ?? {} },
      relacionados,
      arquivos: arquivos.map((a) => ({
        id: a.id,
        nome: a.nome,
        papel: a.papel,
        mime: a.mime,
        estado: a.estado,
        bytes: a.bytes,
        sha256: a.sha256,
        legenda: a.legenda,
        miniaturaUrl: a.miniatura_caminho ? (thumbnails.get(a.miniatura_caminho) ?? null) : null,
      })),
    };
  });

const levantamentoData = z
  .object({
    data_inspecao: civilDate.optional(),
    respostas: z.record(z.string().min(1).max(80), z.enum(respostasLevantamento)).optional(),
    observacoes: z.string().max(8000).optional(),
    limitacao_impeditiva: z.string().max(4000).optional(),
    protocolo: z.string().max(160).optional(),
    codigo_documento: z.string().max(160).optional(),
    revisao_documento: z.string().max(60).optional(),
    art: z.string().max(120).optional(),
    art_inicio: civilDate.optional(),
    prazo_restricao: civilDate.optional(),
  })
  .strict();
const version = { id: uuid, expected_version: z.number().int().positive() };
const commandMeta = { organizationId: uuid, atribuicaoId: uuid.optional(), chave: uuid };
const command = z.discriminatedUnion("comando", [
  z.object({
    ...commandMeta,
    comando: z.literal("criar"),
    dados: z
      .object({
        ativo_id: uuid,
        tipo: z.enum(tiposLevantamento),
        atribuido_a: uuid.optional(),
      })
      .strict(),
  }),
  z.object({ ...commandMeta, ...version, comando: z.literal("salvar"), dados: levantamentoData }),
  z.object({
    ...commandMeta,
    ...version,
    comando: z.literal("submeter"),
    dados: z.object({}).strict(),
  }),
  z.object({
    ...commandMeta,
    ...version,
    comando: z.literal("emitir"),
    dados: z.object({}).strict(),
  }),
  z.object({
    ...commandMeta,
    ...version,
    comando: z.literal("devolver"),
    dados: z.object({ motivo: z.string().trim().min(1).max(4000) }).strict(),
  }),
  z.object({
    ...commandMeta,
    ...version,
    comando: z.literal("aprovar"),
    dados: z
      .object({
        parecer: z.enum(pareceresLevantamento),
        motivo: z.string().trim().min(1).max(4000),
      })
      .strict(),
  }),
]);

export const inspecoesLevantamentos = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(z.object({ organizationId: uuid, ativoId: uuid }))
  .handler(async ({ context, data }): Promise<InspecoesLevantamentos> => {
    const db = client(context.supabase);
    const asset = dataOrThrow(
      await db
        .from("inspecoes_registros")
        .select("cliente_id,unidade_id")
        .eq("organization_id", data.organizationId)
        .eq("colecao", "ativos")
        .eq("id", data.ativoId)
        .single(),
    );
    if (!asset) throw new Error("Ativo indisponível no contexto autorizado.");
    const params = {
      p_org: data.organizationId,
      p_cliente: asset.cliente_id,
      p_unidade: asset.unidade_id,
    };
    const [rowsResponse, candidatesResponse] = await Promise.all([
      db
        .from("inspecoes_levantamentos")
        .select("*")
        .eq("organization_id", data.organizationId)
        .eq("ativo_id", data.ativoId)
        .order("created_at", { ascending: false })
        .limit(30),
      db.rpc("inspecoes_levantamento_candidatos", params),
    ]);
    const rows = (dataOrThrow(rowsResponse) ?? []) as InspecoesLevantamento[];
    const candidates = (dataOrThrow(candidatesResponse) ??
      []) as InspecoesLevantamentos["candidatos"];
    const items = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        bloqueios:
          row.estado === "em_revisao" || row.estado === "aprovado"
            ? ((dataOrThrow(
                await db.rpc("inspecoes_levantamento_bloqueios", {
                  p_org: data.organizationId,
                  p_id: row.id,
                }),
              ) ?? []) as string[])
            : [],
      })),
    );
    return { items, candidatos: candidates };
  });

export const inspecoesExecutar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(command)
  .handler(async ({ context, data }): Promise<InspecoesLevantamento> => {
    const db = client(context.supabase);
    return dataOrThrow(
      await db.rpc("inspecoes_executar", {
        p_org: data.organizationId,
        p_comando: {
          comando: data.comando,
          atribuicao_id: data.atribuicaoId,
          id: "id" in data ? data.id : undefined,
          expected_version: "expected_version" in data ? data.expected_version : undefined,
          chave: data.chave,
          dados: data.dados,
        },
      }),
    ) as InspecoesLevantamento;
  });

const protocolo = z.object({
  organizationId: uuid,
  familia: z.string().regex(/^[A-Z]{2,8}$/),
  tipo: z.enum(tiposLevantamento),
});

export const inspecoesProtocoloAtual = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator(protocolo)
  .handler(async ({ context, data }) => {
    const row = dataOrThrow(
      await client(context.supabase)
        .from("inspecoes_protocolos")
        .select("version,fonte,art_obrigatoria,ensaio_obrigatorio,aprovado_em")
        .eq("organization_id", data.organizationId)
        .eq("familia", data.familia)
        .eq("tipo", data.tipo)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    );
    return z
      .object({
        version: z.number().int().positive(),
        fonte: z.string(),
        art_obrigatoria: z.boolean(),
        ensaio_obrigatorio: z.boolean(),
        aprovado_em: z.string(),
      })
      .nullable()
      .parse(row);
  });

export const inspecoesHomologarProtocolo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    protocolo.extend({
      fonte: z.string().trim().min(5).max(2000),
      justificativa: z.string().trim().min(10).max(4000),
      artObrigatoria: z.boolean(),
      ensaioObrigatorio: z.boolean(),
      version: z.number().int().nonnegative(),
    }),
  )
  .handler(async ({ context, data }) => {
    const result = dataOrThrow(
      await client(context.supabase).rpc("inspecoes_homologar_protocolo", {
        p_org: data.organizationId,
        p_familia: data.familia,
        p_tipo: data.tipo,
        p_fonte: data.fonte,
        p_justificativa: data.justificativa,
        p_art_obrigatoria: data.artObrigatoria,
        p_ensaio_obrigatorio: data.ensaioObrigatorio,
        p_versao_anterior: data.version,
      }),
    );
    return z.object({ version: z.number().int().positive() }).parse(result);
  });
