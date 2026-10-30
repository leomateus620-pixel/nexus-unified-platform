// Synthetic presentation fixtures, isolated from Supabase and never imported by production builds.
import { scenario } from "./data";
const org = "10000000-0000-4000-8000-000000000001",
  client = "20000000-0000-4000-8000-000000000001",
  unit = "21000000-0000-4000-8000-000000000001";
const localId = "33000000-0000-4000-8000-000000000001",
  docId = "33000000-0000-4000-8000-000000000002",
  pendingId = "33000000-0000-4000-8000-000000000003",
  folderId = "33000000-0000-4000-8000-000000000004",
  modelId = "33000000-0000-4000-8000-000000000005",
  ruleId = "33000000-0000-4000-8000-000000000006";
const common = {
  organization_id: org,
  cliente_id: client,
  unidade_id: unit,
  normas: ["NR33", "NR35"],
  descricao:
    "Conteúdo sintético exclusivo do laboratório de apresentação. Sem correspondência com cliente real.",
  dados: {},
  estado: "rascunho",
  version: 1,
  created_at: "2026-10-30T12:00:00Z",
  updated_at: "2026-10-30T12:00:00Z",
  arquivado_em: null,
};
const rows = {
  locais: [
    {
      ...common,
      id: localId,
      titulo: "Local isolado de validação visual",
      tag: "EC 13A",
      tipo: "a_classificar",
      familia: "",
      aliases: ["Referência histórica de teste"],
      estado: "ativo",
    },
  ],
  documentos: [
    {
      ...common,
      id: docId,
      titulo: "Documento nativo de validação visual",
      tipo: "cadastro",
      revisao_numero: 1,
      revisao_atual_id: "35000000-0000-4000-8000-000000000001",
      revisao_necessaria: true,
      impactos_pendentes: 1,
      base_version_atual: 2,
      pode_revisar_impactos: true,
      bloqueio_revisao_impactos: null,
      impactos: [
        {
          id: "36000000-0000-4000-8000-000000000001",
          revisao_origem_id: "35000000-0000-4000-8000-000000000001",
          local_id: localId,
          base_version_anterior: 1,
          base_version_nova: 2,
          campos_alterados: ["titulo"],
          alteracoes: {
            titulo: { anterior: "Título sintético anterior", novo: "Título sintético atualizado" },
          },
          created_at: "2026-10-30T12:00:00Z",
          estado: "pendente",
        },
      ],
      conteudo: {
        schema_version: 1,
        blocos: [
          { id: "title-test", tipo: "titulo", texto: "Identificação do ambiente isolado" },
          {
            id: "paragraph-test",
            tipo: "paragrafo",
            texto:
              "Este conteúdo serve exclusivamente à conferência de legibilidade, editor e navegação. Não comprova migração ou conformidade técnica.",
          },
          {
            id: "table-test",
            tipo: "tabela",
            linhas: [
              ["Campo", "Registro de teste"],
              ["Fonte", "Laboratório isolado"],
            ],
          },
        ],
      },
      recebimento: "nativo",
      estado_origem: null,
    },
  ],
  pendencias: [
    {
      ...common,
      id: pendingId,
      titulo: "Conferir referência documental do local de teste",
      estado: "aberta",
      criticidade: "alta",
      prazo: "2026-11-10",
      tratativa: "",
      local_id: localId,
    },
  ],
  pastas: [
    {
      ...common,
      id: folderId,
      titulo: "Acervo técnico do laboratório",
      estado: "ativo",
      parent_id: null,
    },
  ],
  modelos: [
    {
      ...common,
      id: ruleId,
      titulo: "Regra sintética para revisão da interface",
      tipo: "regra",
      cliente_id: null,
      unidade_id: null,
      conteudo: {
        schema_version: 1,
        blocos: [
          {
            id: "rule-body",
            tipo: "paragrafo",
            texto:
              "Fixture de apresentação. Não contém uma regra normativa real e não pode ser usada em operação.",
          },
        ],
      },
      dados: { blocos: [] },
    },
    {
      ...common,
      id: modelId,
      titulo: "Roteiro de validação visual",
      tipo: "levantamento",
      cliente_id: null,
      unidade_id: null,
      conteudo: { schema_version: 1, blocos: [] },
      dados: {
        blocos: [
          {
            id: "block-test",
            codigo: "B01",
            titulo: "Identificação",
            campos: [{ id: "field-test", nome: "Setor", tipo: "texto", obrigatorio: true }],
          },
        ],
      },
    },
  ],
  levantamentos: [],
  sistemas: [],
};
export async function nrConsultar({ data }) {
  await new Promise((resolve) => setTimeout(resolve, 90));
  if (scenario === "nr-error") throw new Error("Falha de conexão simulada no laboratório isolado.");
  if (data.recurso === "contexto")
    return {
      clientes: [{ id: client, nome: "Cliente sintético — laboratório isolado" }],
      unidades: [{ id: unit, cliente_id: client, nome: "Unidade de testes de apresentação" }],
      permissoes: Object.fromEntries(
        [
          "visualizar",
          "cadastrar",
          "editar",
          "anexar",
          "mover",
          "arquivar",
          "restaurar",
          "revisar",
          "aprovar",
          "emitir",
          "configurar",
        ].map((k) => [k, scenario !== "restricted" || k === "visualizar"]),
      ),
    };
  if (data.recurso === "painel")
    return {
      locais: rows.locais.length,
      documentos: rows.documentos.length,
      pendencias_abertas: rows.pendencias.filter((r) => r.estado === "aberta").length,
      levantamentos: rows.levantamentos.length,
      em_revisao: 0,
      documentos_revisao_necessaria: rows.documentos.filter((row) => row.revisao_necessaria).length,
      pendencias_prioritarias: rows.pendencias,
      documentos_revisao: [],
    };
  if (data.recurso === "historico") return pagedEvents(data);
  if (data.id) {
    const row = rows[data.recurso].find((r) => r.id === data.id);
    if (!row) throw new Error("Registro indisponível no laboratório.");
    return { registro: structuredClone(row) };
  }
  let list = rows[data.recurso].filter((r) => !!r.arquivado_em === !!data.lixeira);
  if (data.recurso === "pastas" && Object.hasOwn(data, "pasta_id"))
    list = list.filter((row) => row.parent_id === (data.pasta_id || null));
  if (data.busca)
    list = list.filter((r) =>
      (r.titulo + " " + (r.tag || "")).toLowerCase().includes(data.busca.toLowerCase()),
    );
  if (data.estado) list = list.filter((r) => r.estado === data.estado);
  return {
    rows: structuredClone(list),
    total: list.length,
    pagina: data.pagina || 0,
    limite: data.limite || 25,
  };
}
export async function nrExecutar({ data }) {
  await new Promise((resolve) => setTimeout(resolve, 160));
  if (scenario === "nr-conflict")
    throw new Error(
      "Outra sessão alterou este registro. Compare as versões antes de salvar. Conflito simulado no laboratório.",
    );
  const list = rows[data.recurso];
  let row = list.find((r) => r.id === data.id);
  if (row && row.version !== data.expected_version)
    throw new Error("Conflito de versão no laboratório isolado.");
  if (!row) {
    row = { ...structuredClone(common), id: crypto.randomUUID(), ...data.dados };
    list.push(row);
  } else if (data.comando === "salvar") Object.assign(row, data.dados);
  else if (data.comando === "arquivar") row.arquivado_em = new Date().toISOString();
  else if (data.comando === "restaurar") row.arquivado_em = null;
  else if (data.comando === "encerrar")
    Object.assign(row, { estado: "encerrada", tratativa: data.dados.tratativa });
  else if (data.comando === "reabrir")
    row.estado = data.recurso === "pendencias" ? "aberta" : "rascunho";
  else if (data.comando === "submeter") row.estado = "em_revisao";
  else if (data.comando === "publicar") row.estado = "publicado";
  else if (data.comando === "nova_revisao") {
    row.estado = "rascunho";
    row.revisao_numero = (row.revisao_numero || 1) + 1;
    row.revisao_atual_id = crypto.randomUUID();
  }
  row.version++;
  return { registro: structuredClone(row) };
}
export async function nrArquivoLimites() {
  return {
    bucket: "isolated-no-storage",
    max_bytes: 50 * 1024 * 1024,
    mime_types: ["application/pdf"],
    extensoes: ["pdf", "png", "jpeg", "docx", "xlsx"],
  };
}
const fixtureFile = {
  id: "34000000-0000-4000-8000-000000000001",
  nome: "original-de-teste.pdf",
  nome_exibicao: "Original de teste do laboratório",
  mime: "application/pdf",
  tamanho: __NEXUS_PDF_FIXTURE__.tamanho,
  sha256: __NEXUS_PDF_FIXTURE__.sha256,
  estado: "vinculado",
  bytes_verificados: true,
  papel: "original",
  version: 1,
  pasta_id: null,
  cliente_id: client,
  unidade_id: unit,
};
export async function nrArquivosListar({ data }) {
  const records =
    !!data.lixeira === (fixtureFile.estado === "arquivado") ? [structuredClone(fixtureFile)] : [];
  return { rows: records, total: records.length, pagina: 0, limite: 20 };
}
export async function nrArquivoBaixar() {
  return {
    url: "/storage/v1/object/sign/nexus-operacional/fixture-reader.pdf?token=nr-isolated",
    expira_em: new Date(Date.now() + 60000).toISOString(),
    arquivo: structuredClone(fixtureFile),
  };
}
export async function nrArquivoCancelar() {
  fixtureFile.estado = "arquivado";
  fixtureFile.version++;
  return structuredClone(fixtureFile);
}
export async function nrArquivoAlterar({ data }) {
  if (data.expected_version !== fixtureFile.version)
    throw new Error("Conflito de versão do arquivo isolado.");
  if (data.comando === "renomear") fixtureFile.nome_exibicao = data.dados.nome_exibicao;
  else if (data.comando === "mover") fixtureFile.pasta_id = data.dados.pasta_id;
  else if (data.comando === "restaurar") fixtureFile.estado = "vinculado";
  fixtureFile.version++;
  return structuredClone(fixtureFile);
}
const unavailable = async () => {
  throw new Error("Storage real não é chamado neste laboratório isolado.");
};
export const nrArquivoPreparar = unavailable,
  nrArquivoConfirmar = unavailable,
  nrArquivoRetomar = unavailable;

export const nrDocumentoExportar = unavailable,
  nrDocumentoConverterDocx = unavailable;

export async function nrRevisarImpactos({ data }) {
  const row = rows.documentos.find((item) => item.id === data.documento_id);
  if (
    !row ||
    row.version !== data.expected_version ||
    row.base_version_atual !== data.base_expected_version
  )
    throw new Error("Conflito simulado de versão.");
  if (row.impactos.some((impact) => impact.revisao_origem_id === data.revisao_id))
    throw new Error("Crie nova revisão antes de conferir.");
  const count = row.impactos.filter((impact) => impact.estado === "pendente").length;
  row.impactos = row.impactos.map((impact) => ({
    ...impact,
    estado: "revisado",
    revisao_destino_id: data.revisao_id,
    motivo: data.motivo,
  }));
  row.revisao_necessaria = false;
  row.impactos_pendentes = 0;
  return {
    registro: structuredClone(row),
    impactos_revisados: count,
    revisao_conferida_id: data.revisao_id,
  };
}
export async function nrArquivoConsumo() {
  return {
    bytes_fisicos_medidos: fixtureFile.tamanho,
    objetos_fisicos: 1,
    objetos_sem_tamanho: 0,
    medido_em: new Date().toISOString(),
    escopo_medicao: "Fixture sintética do laboratório",
    capacidade_informada: "Não configurada neste laboratório",
    escopo_capacidade: "nao_confirmado",
    quota_aplicada: false,
    ram_banco_informada: "Não medida no laboratório",
    ram_banco_medida: false,
    por_unidade: [{ cliente_id: client, unidade_id: unit, objetos: 1, bytes: fixtureFile.tamanho }],
    por_bucket: [{ bucket_id: "isolated-no-storage", objetos: 1, bytes: fixtureFile.tamanho }],
    quantidade_revisoes: 1,
    uploads_em_andamento: 0,
    falhas: 0,
    lotes_em_andamento: 0,
    lotes_com_pendencias: 0,
  };
}

// These paginated/expanded fixtures are test-only; production calls authenticated server functions.
const events = Array.from({ length: 28 }, (_, index) => ({
  id: (9007199254741028n - BigInt(index)).toString(),
  recurso: "documentos",
  registro_id: docId,
  comando: "salvar",
  motivo: `Motivo sintético do evento ${index + 1}`,
  created_at: new Date(Date.UTC(2026, 9, 30, 12, 30) - index * 60000).toISOString(),
  motivo_resumido: index === 0,
  escopo: index === 27 ? "nao_classificado" : "registro",
}));
function pagedEvents(data) {
  const page = data.pagina || 0,
    limit = data.limite || 25;
  return {
    rows: structuredClone(events.slice(page * limit, (page + 1) * limit)),
    total: events.length,
    pagina: page,
    limite: limit,
  };
}
export async function nrHistoricoListar({ data }) {
  window.__nexusCalls.push({ name: "nrHistoricoListar", data });
  return pagedEvents(data);
}
export async function nrHistoricoDetalhe({ data }) {
  window.__nexusCalls.push({ name: "nrHistoricoDetalhe", data });
  const row = events.find((event) => event.id === data.evento_id);
  if (!row) throw new Error("Evento sintético indisponível.");
  return {
    ...structuredClone(row),
    motivo: "Texto integral sintético do motivo. Este conteúdo só é carregado ao abrir o evento.",
    antes: { titulo: "Título sintético anterior", dados: { origem: "Laboratório isolado" } },
    depois: { titulo: "Título sintético posterior", dados: { origem: "Laboratório isolado" } },
  };
}
function revisionFor(data) {
  const row = rows[data.recurso].find((record) => record.id === data.registro_id);
  if (!row) throw new Error("Versão sintética indisponível.");
  return {
    id: row.revisao_atual_id || modelId,
    numero: row.revisao_numero || 1,
    estado: row.estado,
    vigencia: "vigente",
    created_at: common.created_at,
    conteudo: row.conteudo || { schema_version: 1, blocos: [] },
    dados: row.dados,
    snapshot: { titulo: row.titulo, origem: "Fixture sintética do laboratório" },
    fontes_publicacao: publications.get(row.id)?.fontes || [],
  };
}
export async function nrRevisoesListar({ data }) {
  window.__nexusCalls.push({ name: "nrRevisoesListar", data });
  const row = revisionFor(data);
  return {
    rows: [
      {
        id: row.id,
        numero: row.numero,
        estado: row.estado,
        vigencia: row.vigencia,
        created_at: row.created_at,
        publicacao_tecnica_interna: !!row.dados.publicacao_tecnica,
      },
    ],
    total: 1,
    pagina: data.pagina || 0,
    limite: data.limite || 25,
  };
}
export async function nrRevisaoDetalhe({ data }) {
  window.__nexusCalls.push({ name: "nrRevisaoDetalhe", data });
  const row = revisionFor(data);
  if (row.id !== data.revisao_id) throw new Error("Versão sintética não corresponde ao registro.");
  return structuredClone(row);
}
const publications = new Map();
export async function nrModeloPublicacaoContexto({ data }) {
  const publication = publications.get(data.modelo_id);
  const row = rows.modelos.find((model) => model.id === data.modelo_id);
  return {
    profissional:
      scenario === "restricted"
        ? null
        : {
            id: "37000000-0000-4000-8000-000000000001",
            nome: "Responsável sintético do laboratório",
            registro_profissional: "TESTE-000",
          },
    pode_publicar: scenario !== "restricted" && row?.estado !== "publicado",
    bloqueio:
      scenario === "restricted"
        ? "Fixture de perfil sem vínculo profissional: publicação indisponível."
        : row?.estado === "publicado"
          ? "Versão publicada preservada. Crie nova revisão para alterar."
          : null,
    versoes: publication ? [publication.versao] : [],
    fontes: publication?.fontes || [],
  };
}
export async function nrModeloPublicarTecnico({ data }) {
  const row = rows.modelos.find((model) => model.id === data.modelo_id);
  if (scenario === "restricted" || !row) throw new Error("Sem vínculo profissional na fixture.");
  if (row.version !== data.expected_version) throw new Error("Conflito de versão simulado.");
  const snapshot = {
    id: "37000000-0000-4000-8000-000000000001",
    nome: "Responsável sintético do laboratório",
    registro_profissional_declarado: "TESTE-000",
  };
  row.estado = "publicado";
  row.version++;
  row.dados.publicacao_tecnica = {
    evidencia: data.evidencia,
    profissional_snapshot: snapshot,
    aplicacao_automatica: false,
    certificacao_externa: false,
  };
  publications.set(row.id, {
    versao: {
      id: modelId,
      numero: row.version,
      created_at: new Date().toISOString(),
      publicacao_tecnica_interna: true,
      dados: { publicacao_tecnica: { profissional_snapshot: snapshot } },
    },
    fontes: data.evidencia.fontes.map((source, index) => ({
      ...source,
      id: `synthetic-source-${index}`,
      modelo_versao_id: modelId,
    })),
  });
  return { registro: structuredClone(row) };
}

export async function nrImportacaoInspecionar({ data }) {
  const lot = {
    id: "38000000-0000-4000-8000-000000000001",
    origem: "Lote sintético do laboratório",
    estado: "com_pendencias",
    updated_at: common.updated_at,
  };
  const items = ["importado", "indisponivel", "conflito"].map((resultado, index) => ({
    id: `39000000-0000-4000-8000-00000000000${index + 1}`,
    tipo: "referencia_sintetica",
    externo_id: `fixture-${index + 1}`,
    resultado,
    motivo: "Motivo sintético preservado para conferência da interface.",
    motivo_resumido: false,
    capturado_em: common.created_at,
  }));
  if (!data.lote_id) return { rows: [lot], total: 1, pagina: 0, limite: 25 };
  if (data.lote_id !== lot.id) throw new Error("Lote sintético indisponível.");
  if (data.item_id) {
    const item = items.find((row) => row.id === data.item_id);
    if (!item) throw new Error("Item sintético indisponível.");
    return {
      lote: lot,
      item: {
        ...item,
        payload: {
          sintetico: true,
          texto: "Snapshot fictício para teste de leitura, sem dados de clientes.",
        },
        evidencia: { metodo: "Fixture de teste" },
      },
    };
  }
  const filtered = items.filter(
    (row) =>
      (!data.resultado || row.resultado === data.resultado) &&
      (!data.busca || `${row.externo_id} ${row.motivo}`.includes(data.busca)),
  );
  return {
    lote: lot,
    rows: filtered,
    total: filtered.length,
    pagina: 0,
    limite: 25,
    por_resultado: items.map((row) => ({ resultado: row.resultado, quantidade: 1 })),
  };
}
