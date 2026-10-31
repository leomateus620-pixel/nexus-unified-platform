// Synthetic presentation fixtures, isolated from Supabase and never imported by production builds.
import { scenario } from "./data";
import { calcularSnapshotNr, nrSalvarCalculosSchema } from "../../src/features/nr/calculos.schemas";
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
const rows: Record<string, any[]> = {
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
      id: "33000000-0000-4000-8000-000000000007",
      modelo_versao_id: "34000000-0000-4000-8000-000000000007",
      titulo: "Modelo documental sintético com campos reais de teste",
      tipo: "documento",
      cliente_id: null,
      unidade_id: null,
      conteudo: {
        schema_version: 1,
        blocos: [
          { id: "model-heading", tipo: "titulo", texto: "Conteúdo copiado do modelo sintético" },
          { id: "model-tag", tipo: "campo", chave: "local.tag", modo: "vinculado" },
          { id: "model-unit", tipo: "campo", chave: "unidade.nome", modo: "snapshot" },
        ],
      },
    },
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
// A distinct scenario exercises contextual recovery. Every value here is artificial.
const contextual = ["nr-contextual", "nr-brand", "nr-media"].includes(scenario);
const secondClient = "20000000-0000-4000-8000-000000000002";
const secondUnit = "21000000-0000-4000-8000-000000000002";
const emptyUnit = "21000000-0000-4000-8000-000000000003";
const seedUnit = "21000000-0000-4000-8000-000000000004";
const surveyId = "33000000-0000-4000-8000-000000000008";
const historicalModelId = "33000000-0000-4000-8000-000000000009";
const alternateLocalId = "33000000-0000-4000-8000-000000000010";
const contextualClients = [
  { id: client, nome: "Cliente Alfa — laboratório isolado", cnpj: "Identificação sintética" },
  { id: secondClient, nome: "Cliente Beta — laboratório isolado", cnpj: "Identificação sintética" },
];
const contextualUnits = [
  {
    id: unit,
    cliente_id: client,
    nome: "Fábrica sintética",
    endereco: "Endereço fictício de homologação",
    escopo: "Espaços confinados e documentos de altura",
    cnpj: "Identificação de teste",
    locais_total: 3,
    documentos_total: 3,
    documentacao: { situacao: "Em revisão", responsavel: "Responsável histórico sintético" },
  },
  {
    id: secondUnit,
    cliente_id: secondClient,
    nome: "Unidade Beta sintética",
    endereco: "Outro endereço fictício",
    escopo: "Espaços confinados",
    locais_total: 1,
    documentos_total: 1,
  },
  {
    id: emptyUnit,
    cliente_id: client,
    nome: "Matriz sintética",
    endereco: "Endereço fictício da matriz",
    escopo: "Documental",
    locais_total: 0,
    documentos_total: 1,
  },
  {
    id: seedUnit,
    cliente_id: client,
    nome: "Sementeiro sintético",
    endereco: "Endereço fictício do sementeiro",
    escopo: "Documental",
    locais_total: 0,
    documentos_total: 1,
  },
];
const technicalFixtureEvents = Array.from({ length: 7 }, (_, index) => ({
  data: `2026-10-${String(10 + index).padStart(2, "0")}`,
  autor: "Autor histórico sintético",
  acao: `Atualização técnica de teste ${index + 1}`,
  texto: `Narrativa integral sintética ${index + 1}: evidência de apresentação, sem conclusão de engenharia real.`,
}));
const contextualBlocks = [
  "Identificação",
  "Enquadramento e descrição",
  "Acessos e bocas de visita",
  "Fotos",
  "Sinalização",
  "Atividades e riscos",
  "Geometria e volume",
  "Ventilação",
  "Aeração fixa",
  "Requisitos e EPI",
  "Resgate",
  "Emergência",
  "Energias e bloqueio",
  "Itens de avaliação",
  "Histórico e fechamento",
  "Ancoragens, linhas de vida e laudos",
].map((titulo, index) => ({
  id: `B${String(index + 1).padStart(2, "0")}`,
  codigo: `B${String(index + 1).padStart(2, "0")}`,
  titulo,
  campos: [
    {
      id: `B${String(index + 1).padStart(2, "0")}.observacao`,
      nome: "Observação de teste",
      tipo: "texto_longo",
      obrigatorio: false,
    },
  ],
}));
contextualBlocks[0].campos = [
  { id: "B01.tag", nome: "TAG do espaço", tipo: "texto", obrigatorio: true },
  { id: "B01.setor", nome: "Área / setor", tipo: "texto", obrigatorio: true },
];
Object.assign(contextualBlocks[6], {
  campos: [
    {
      id: "B07.forma",
      nome: "Forma do espaço",
      tipo: "selecao",
      opcoes: ["cilindrica", "prismatica", "informada"],
      rotulos_opcoes: {
        cilindrica: "Cilíndrica",
        prismatica: "Prismática",
        informada: "Volume informado em documento",
      },
      obrigatorio: true,
    },
    {
      id: "B07.diametro",
      nome: "Diâmetro (m)",
      tipo: "numero",
      obrigatorio: true,
      mostrar_se: { campo: "B07.forma", valor: ["cilindrica"] },
    },
    {
      id: "B07.comprimento",
      nome: "Comprimento (m)",
      tipo: "numero",
      mostrar_se: { campo: "B07.forma", valor: ["prismatica"] },
    },
    { id: "B07.altura", nome: "Altura (m)", tipo: "numero", obrigatorio: true },
    { id: "B07.volume", nome: "Volume preservado (m³)", tipo: "lista", tipo_origem: "calculado" },
  ],
});
Object.assign(contextualBlocks[8], { aplica_se: { familias: ["Silos e armazéns"] } });
Object.assign(contextualBlocks[13], {
  campos: [
    {
      id: "B14.itens",
      nome: "Itens avaliados",
      tipo: "lista",
      tipo_origem: "checklist",
      obrigatorio: true,
    },
  ],
});
Object.assign(contextualBlocks[15], {
  campos: [
    {
      id: "B16.sistemas",
      nome: "Sistemas levantados",
      tipo: "lista",
      obrigatorio: true,
      rotulo_adicionar: "Adicionar sistema",
      subcampos: [
        {
          id: "categoria",
          nome: "Categoria",
          tipo: "selecao",
          opcoes: ["Ancoragem individual", "Sistema de resgate"],
        },
        { id: "sistema", nome: "Descrição do sistema", tipo: "texto" },
        {
          id: "existencia",
          nome: "Existência",
          tipo: "selecao",
          opcoes: ["Presente", "Não identificado"],
        },
        { id: "quantidade", nome: "Quantidade", tipo: "numero" },
        {
          id: "uso",
          nome: "Situação de uso",
          tipo: "selecao",
          opcoes: ["A instalar", "Uso condicionado"],
        },
      ],
    },
    {
      id: "B16.documentos_apresentados",
      nome: "Documentos apresentados pela unidade",
      tipo: "lista",
      tipo_origem: "multipla",
      opcoes: ["Projeto", "Memorial de cálculo", "ART", "Registro de inspeção"],
    },
    { id: "B16.exigencias", nome: "Documentação exigida", tipo: "texto_longo", obrigatorio: true },
  ],
});
if (contextual) {
  const first = rows.locais[0];
  Object.assign(first, {
    titulo: "Reservatório sintético Alfa",
    tag: "EC 01",
    tipo: "EC",
    familia: "Tanques",
    normas: ["NR33"],
    dados: {
      setor: "Setor fictício Alfa",
      enquadramento: "confirmado_ec",
      acesso: "Acesso superior sintético",
      geometria: {
        forma: "cilindrica",
        diametro: 2.5,
        altura: 4,
        volume: 19.63,
        volume_informado: 21,
        metodo: "Medição sintética",
      },
      cadastro: {
        material: "Aço",
        sinalizacao_existe: "Sim",
        historico_equipamento: "Nenhuma ocorrência operacional registrada na fixture.",
        emergencia: "Plano sintético a revisar",
        energias: ["Elétrica"],
        pontos_bloqueio: "Ponto fictício",
      },
      aberturas: [{ modelo: "Tampa", formato: "Circular", diametro: 0.7, posicao: "Superior" }],
      itens: {
        ANC: {
          existencia: "ausente",
          aplicabilidade: "aplicavel",
          condicao: "nao_avaliada",
          acao: "instalar",
          validacao: "proposta",
          justificativa: "Justificativa exclusivamente sintética",
        },
      },
      fotos: [
        {
          arquivo: "fotos/isolado/ec01.jpg",
          miniatura: "fotos/isolado/thumb/ec01.jpg",
          legenda: "Acesso sintético sem bytes recuperados",
          data: "2026-10-10",
          autor: "Autor histórico sintético",
        },
      ],
      historico: technicalFixtureEvents,
      resgate: { cenario: "Cenário fictício", rota: "Rota sintética" },
      levantamento: {
        modelo: "Modelo histórico sintético",
        situacao: "concluido",
        autor: "Autor histórico sintético",
      },
    },
    resumo_tecnico: {
      setor: "Setor fictício Alfa",
      enquadramento: "confirmado_ec",
      situacao_levantamento: "concluido",
      memorial: "Em revisão",
      avaliacoes_total: 1,
      documentos_total: 2,
      imagens_total: 0,
      historico_tecnico_total: 7,
    },
  });
  rows.locais.push({
    ...structuredClone(first),
    id: alternateLocalId,
    cliente_id: secondClient,
    unidade_id: secondUnit,
    titulo: "Reservatório sintético Beta",
    dados: {
      ...structuredClone(first.dados),
      setor: "Setor fictício Beta",
      historico: [
        {
          data: "2026-10-19",
          autor: "Outro autor sintético",
          acao: "Acontecimento exclusivo Beta",
          texto: "Este evento pertence somente à unidade Beta.",
        },
      ],
      fotos: [],
    },
  });
  for (const [suffix, tag] of [
    ["011", "EC 13"],
    ["012", "EC 28"],
  ])
    rows.locais.push({
      ...structuredClone(first),
      id: `33000000-0000-4000-8000-000000000${suffix}`,
      tag,
      titulo: `Local sintético ${tag}`,
      dados: {
        ...structuredClone(first.dados),
        historico: [
          {
            data: "2026-10-20",
            autor: "Autor sintético",
            acao: "Divergência de documento",
            texto: "Divergência da origem preservada na fixture.",
          },
        ],
        fotos: [],
      },
    });
  rows.modelos.push({
    ...structuredClone(common),
    id: historicalModelId,
    titulo: "Roteiro histórico preservado",
    tipo: "levantamento",
    cliente_id: null,
    unidade_id: null,
    dados: { blocos: [] },
    conteudo: { schema_version: 1, blocos: [] },
  });
  Object.assign(
    rows.modelos.find((r) => r.id === modelId),
    {
      titulo: "MLT-EC-R00 — roteiro sintético de apresentação",
      dados: { blocos: contextualBlocks },
    },
  );
  rows.levantamentos.push({
    ...structuredClone(common),
    id: surveyId,
    titulo: "Levantamento sintético EC 01",
    local_id: localId,
    modelo_id: historicalModelId,
    dados: {
      modelo_legado: true,
      respostas_extraidas_por_caminho: true,
      estado_historico: "concluido",
      blocos: [{ id: "B07", titulo: "Matriz histórica de teste", estado: "concluido" }],
    },
    modelo_snapshot: { numero: 1, dados: { blocos: [] } },
    modelo_apresentacao: {
      id: modelId,
      numero: 2,
      projecao_versao: "nr-levantamento-apresentacao-1",
      origem: "DTO comprovado de teste, sem acesso à produção",
      dados: { blocos: contextualBlocks },
    },
    local_contexto: { tipo: "EC", familia: "Tanques" },
    local_titulo: first.titulo,
    local_tag: first.tag,
    respostas: {
      "B01.tag": "EC 01",
      "B01.setor": "Setor fictício Alfa",
      "B07.forma": "cilindrica",
      "B07.diametro": 2.5,
      "B07.altura": 4,
      "B07.volume": 19.63,
      "B14.itens": first.dados.itens,
      "B16.sistemas": [
        {
          categoria: "Ancoragem individual",
          sistema: "Sistema fictício",
          existencia: "Não identificado",
          quantidade: 0,
          uso: "A instalar",
          fonte_futura: "Propriedade desconhecida preservada",
        },
      ],
      "B16.documentos_apresentados": ["Projeto"],
      "B16.exigencias": "Conferir documentos e responsável técnico na homologação.",
    },
  });
  Object.assign(rows.documentos[0], {
    local_id: localId,
    local_tag: "EC 01",
    local_titulo: first.titulo,
    titulo: "Cadastro sintético EC 01 — documento emitido",
    estado: "emitido_origem",
    estado_origem: "Emitido na fonte sintética",
    recebimento: "pendente",
    resumo_documental: {
      vigencia: "vigente",
      vigencia_apresentacao: "vigente",
      motivo_substituicao: null,
      data_origem: "2026-10-10",
      autor_historico: "Responsável sintético",
      revisao_numero: 1,
      arquivos_word: 0,
      arquivos_pdf: 1,
      arquivos_total: 1,
      copia_editavel: false,
      documento_origem_id: null,
      originais_comprovados: [],
      copias_editaveis: [
        {
          id: "33000000-0000-4000-8000-000000000013",
          titulo: "Cópia editável sintética do cadastro",
          estado: "rascunho",
          revisao_atual_id: null,
          normas: ["NR33", "NR35"],
        },
      ],
      disponibilidade: "arquivos_confirmados",
    },
  });
  rows.documentos.push(
    {
      ...structuredClone(rows.documentos[0]),
      id: "33000000-0000-4000-8000-000000000013",
      titulo: "Cópia editável sintética do cadastro",
      tipo: "derivado_docx",
      estado: "rascunho",
      resumo_documental: {
        ...structuredClone(rows.documentos[0].resumo_documental),
        copia_editavel: true,
        documento_origem_id: docId,
        copias_editaveis: [],
      },
    },
    {
      ...structuredClone(rows.documentos[0]),
      id: "33000000-0000-4000-8000-000000000014",
      titulo: "Procedimento sintético de altura EC 01",
      normas: ["NR35"],
      resumo_documental: {
        ...structuredClone(rows.documentos[0].resumo_documental),
        copias_editaveis: [],
      },
    },
  );
  for (const [id, u, title] of [
    ["015", unit, "Documento geral sintético da fábrica"],
    ["016", emptyUnit, "Documento sintético da matriz"],
    ["017", seedUnit, "Documento sintético do sementeiro"],
  ])
    rows.documentos.push({
      ...structuredClone(rows.documentos[0]),
      id: `33000000-0000-4000-8000-000000000${id}`,
      unidade_id: u,
      local_id: null,
      local_tag: null,
      local_titulo: null,
      titulo: title,
    });
  rows.documentos.push({
    ...structuredClone(rows.documentos[0]),
    id: "33000000-0000-4000-8000-000000000018",
    cliente_id: secondClient,
    unidade_id: secondUnit,
    local_id: alternateLocalId,
    titulo: "Documento exclusivo EC 01 Beta",
  });
  rows.pendencias.push({
    ...structuredClone(rows.pendencias[0]),
    id: "33000000-0000-4000-8000-000000000019",
    titulo: "Tratativa histórica sintética encerrada",
    estado: "encerrada",
    tratativa: "Encerramento sintético preservado",
    dados: {
      diagnostico: "Diagnóstico de teste",
      encerrada_em: "2026-10-18",
      encerrada_por: "Responsável histórico sintético",
      justificativa: "Justificativa integral de teste",
    },
    tratativas: [
      {
        texto: "Tratativa de teste preservada",
        autor_historico: "Responsável histórico sintético",
        data_origem: "2026-10-18",
      },
    ],
  });
  rows.pendencias.push({
    ...structuredClone(rows.pendencias[0]),
    id: "33000000-0000-4000-8000-000000000020",
    titulo: "Conferir documentação da matriz sintética",
    unidade_id: emptyUnit,
    local_id: null,
  });
  rows.pastas[0].resumo_pasta = { subpastas: 0, documentos: 1, arquivos: 1, imagens: 0 };
}
// Optional long collection for pagination/return-focus checks. Never part of app data.
if (contextual && new URLSearchParams(location.search).get("nrLongTag") === "1") {
  rows["locais"]![0]!.tag = "EC-" + "IDENTIFICADOR-TECNICO-".repeat(6).slice(0, 117);
}
if (contextual && new URLSearchParams(location.search).get("nrExtraLocals") === "40") {
  for (let index = 1; index <= 40; index++) {
    rows.locais.push({
      ...structuredClone(rows.locais[0]),
      id: `33100000-0000-4000-8000-${String(index).padStart(12, "0")}`,
      tag: `EC ${100 + index}`,
      titulo: `Local sintético de retorno ${index}`,
    });
  }
}
const mediaFixtureId = (index: number) =>
  `33300000-0000-4000-8000-${String(index).padStart(12, "0")}`;
const mediaFallback =
  scenario === "nr-media" && new URLSearchParams(location.search).get("nrMediaFallback") === "1";
if (scenario === "nr-media") {
  rows.locais[0].dados.fotos = [
    {
      id: "same-source",
      arquivo: "fotos/isolado/media-a.jpg",
      arquivo_id: mediaFixtureId(1),
      miniatura_arquivo_id: mediaFixtureId(9),
      legenda: "Imagem horizontal sintética para conferir legenda lateral",
      data: "2026-10-30",
      autor: "Autor sintético",
    },
    {
      arquivo: "fotos/isolado/media-b.jpg",
      miniatura_arquivo_id: mediaFixtureId(2),
      legenda: "Prévia vertical sintética sem original recuperado",
    },
    {
      arquivo: "fotos/isolado/media-c.jpg",
      arquivo_id: mediaFixtureId(3),
      legenda: "Assinatura expirada sintética recuperada uma vez",
    },
    {
      arquivo: "fotos/isolado/media-d.jpg",
      arquivo_id: mediaFixtureId(4),
      legenda: "Imagem sintética sem autorização",
    },
    {
      arquivo: "fotos/isolado/media-e.jpg",
      arquivo_id: mediaFixtureId(5),
      legenda: "Imagem sintética com falha HTTP persistente",
    },
    {
      arquivo: "fotos/isolado/media-f.jpg",
      arquivo_id: mediaFixtureId(6),
      legenda: "Miniatura sintética em processamento",
    },
    {
      arquivo: "fotos/isolado/media-g.jpg",
      arquivo_id: mediaFixtureId(7),
      legenda: "Miniatura sintética com falha de processamento",
    },
    {
      id: "same-source",
      arquivo: "fotos/isolado/media-a.jpg",
      arquivo_id: mediaFixtureId(1),
      legenda: "Mesma imagem sintética com uma segunda legenda preservada",
    },
  ];
  if (mediaFallback) {
    for (const index of [2, 3, 5, 6])
      rows.locais[0].dados.fotos[index].miniatura_arquivo_id = mediaFixtureId(index + 11);
  }
}
const associatedContexts = contextual
  ? [...contextualUnits]
  : [{ id: unit, cliente_id: client, nome: "Unidade de testes de apresentação" }];
const scopedRows = (records, data) =>
  records.filter(
    (row) =>
      (!data.norma || row.normas.includes(data.norma)) &&
      (!data.cliente_id || !row.cliente_id || row.cliente_id === data.cliente_id) &&
      (!data.unidade_id || !row.unidade_id || row.unidade_id === data.unidade_id),
  );
export async function nrAssociarContexto({ data }) {
  if (scenario === "restricted" || data.organization_id !== org)
    throw new Error("Associação não autorizada na fixture.");
  if (
    !associatedContexts.some(
      (unit) => unit.id === data.unidade_id && unit.cliente_id === data.cliente_id,
    )
  )
    associatedContexts.push({
      id: data.unidade_id,
      cliente_id: data.cliente_id,
      nome: "Nova unidade associada de teste",
    });
  window.__nexusCalls.push({ name: "nrAssociarContexto", data });
  return { cliente_id: data.cliente_id, unidade_id: data.unidade_id };
}
export async function nrConsultar({ data }) {
  window.__nexusCalls.push({ name: "nrConsultar", data });
  await new Promise((resolve) => setTimeout(resolve, 90));
  if (scenario === "nr-error") throw new Error("Falha de conexão simulada no laboratório isolado.");
  if (data.recurso === "contexto")
    return {
      clientes:
        scenario === "nr-brand"
          ? [
              {
                ...contextualClients[0],
                marca: {
                  caminho: "/brands/cotrirosa.png",
                  origem: "Ativo oficial usado somente para teste de apresentação",
                  sha256: "8acbb5f230bc5da747005f4440c8dd28d976e0b6a84ac25da2b8308d55f944b7",
                  mime: "image/png",
                  largura: 211,
                  altura: 40,
                  tamanho: 8349,
                  superficie: "escura",
                },
              },
              {
                ...contextualClients[1],
                marca: {
                  caminho: "/brands/camera.svg",
                  origem: "Ativo oficial corporativo usado somente para teste de apresentação",
                  sha256: "a7965c6dc0d707d83d4320f2ea5e8119ec6cbbdb216999c4b033b73dabb2d917",
                  mime: "image/svg+xml",
                  largura: 258,
                  altura: 42,
                  tamanho: 4023,
                  superficie: "clara",
                },
              },
              ...Array.from({ length: 25 }, (_, index) => ({
                id: `20000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`,
                nome: `Cliente Z ${index + 3} — laboratório isolado`,
              })),
            ]
          : contextual
            ? contextualClients
            : [{ id: client, nome: "Cliente sintético — laboratório isolado" }],
      unidades: associatedContexts,
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
      locais: scopedRows(rows.locais, data).length,
      documentos: scopedRows(rows.documentos, data).filter((r) => r.tipo !== "derivado_docx")
        .length,
      documentos_origem: scopedRows(rows.documentos, data).filter((r) => r.tipo !== "derivado_docx")
        .length,
      copias_editaveis: scopedRows(rows.documentos, data).filter((r) => r.tipo === "derivado_docx")
        .length,
      arquivos_fisicos: 1,
      historico_tecnico: contextual
        ? scopedRows(rows.locais, data)
            .flatMap((local) =>
              (local.dados.historico || []).map((event) => ({
                ...event,
                autor_historico: event.autor,
                local_id: local.id,
                local_tag: local.tag,
                local_titulo: local.titulo,
              })),
            )
            .slice(0, 6)
        : [],
      eventos_globais: contextual
        ? [
            {
              escopo: "global_origem",
              acao: "Evento global sintético",
              data: "2026-10-10",
              texto: "Sem relação comprovada com unidade específica.",
            },
          ]
        : [],
      pendencias_abertas: scopedRows(rows.pendencias, data).filter((r) => r.estado === "aberta")
        .length,
      levantamentos: scopedRows(rows.levantamentos, data).length,
      em_revisao: 0,
      documentos_revisao_necessaria: rows.documentos.filter((row) => row.revisao_necessaria).length,
      pendencias_prioritarias: scopedRows(rows.pendencias, data).filter(
        (r) => r.estado === "aberta",
      ),
      documentos_revisao: [],
    };
  if (data.recurso === "historico") return pagedEvents(data);
  if (data.recurso === "historico_tecnico") {
    const records = scopedRows(rows.locais, data).flatMap((local) =>
      (local.dados.historico || []).map((event, index) => ({
        ...event,
        id: `${local.id}:${index}`,
        autor_historico: event.autor,
        local_id: local.id,
        local_tag: local.tag,
        local_titulo: local.titulo,
      })),
    );
    const page = data.pagina || 0,
      limit = data.limite || 25;
    return {
      rows: records.slice(page * limit, (page + 1) * limit),
      total: records.length,
      pagina: page,
      limite: limit,
    };
  }
  if (data.id) {
    const row = scopedRows(rows[data.recurso], data).find((r) => r.id === data.id);
    if (!row) throw new Error("Registro indisponível no laboratório.");
    return { registro: structuredClone(row) };
  }
  let list = scopedRows(rows[data.recurso], data).filter(
    (r) => !!r.arquivado_em === !!data.lixeira,
  );
  if (data.local_id) list = list.filter((row) => row.local_id === data.local_id);
  if (data.somente_unidade) list = list.filter((row) => !row.local_id);
  if (data.recurso === "documentos" && data.copias_editaveis === false)
    list = list.filter((row) => row.tipo !== "derivado_docx");
  if (data.recurso === "pastas" && Object.hasOwn(data, "pasta_id"))
    list = list.filter((row) => row.parent_id === (data.pasta_id || null));
  if (data.busca)
    list = list.filter((r) =>
      (r.titulo + " " + (r.tag || "")).toLowerCase().includes(data.busca.toLowerCase()),
    );
  if (data.estado) list = list.filter((r) => r.estado === data.estado);
  if (data.tipo) list = list.filter((r) => r.tipo === data.tipo);
  const limit = data.limite || 25,
    page = data.pagina || 0;
  list.sort(
    (a, b) =>
      new Intl.Collator("pt-BR", { numeric: true }).compare(a.tag || a.titulo, b.tag || b.titulo) ||
      a.id.localeCompare(b.id),
  );
  return {
    rows: structuredClone(list.slice(page * limit, (page + 1) * limit)),
    total: list.length,
    pagina: page,
    limite: limit,
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
  if (scenario === "nr-media") {
    const mediaRows = [
      {
        ...structuredClone(fixtureFile),
        id: mediaFixtureId(10),
        nome_exibicao: null,
        nome: "Imagem sintética vinculada.png",
        mime: "image/png",
        extensao: "png",
        papel: "foto",
        local_id: localId,
      },
      {
        ...structuredClone(fixtureFile),
        id: mediaFixtureId(8),
        nome_exibicao: null,
        nome: "Imagem sintética com envio pendente.png",
        mime: "image/png",
        extensao: "png",
        papel: "foto",
        local_id: localId,
        estado: "preparado",
        bytes_verificados: false,
      },
      {
        ...structuredClone(fixtureFile),
        id: mediaFixtureId(2),
        nome_exibicao: null,
        nome: "Miniatura sintética da origem.png",
        mime: "image/png",
        extensao: "png",
        papel: "foto",
        local_id: localId,
        origem_metadata: { tipo: "miniatura_origem" },
      },
    ];
    return {
      rows: data.lixeira ? [] : mediaRows,
      total: data.lixeira ? 0 : mediaRows.length,
      pagina: 0,
      limite: 20,
    };
  }
  const records =
    !!data.lixeira === (fixtureFile.estado === "arquivado") ? [structuredClone(fixtureFile)] : [];
  return { rows: records, total: records.length, pagina: 0, limite: 20 };
}
export async function nrDocumentoImagensVinculadas({ data }) {
  window.__nexusCalls.push({ name: "nrDocumentoImagensVinculadas", data });
  if (data.organization_id !== org) throw new Error("Contexto sintético indisponível.");
  // This fixture contains a PDF, no converted DOCX image assets.
  return { rows: [] };
}
export async function nrFotoOcorrenciasLer() {
  return [];
}
export async function nrArquivoImagem({ data }) {
  window.__nexusCalls.push({ name: "nrArquivoImagem", data });
  if (data.organization_id !== org) throw new Error("Contexto sintético indisponível.");
  if (scenario === "nr-media") {
    const index = Number(data.id.slice(-12));
    if (index === 4) throw new Error("Acesso não autorizado à imagem.");
    const count = window.__nexusCalls.filter(
      (call) =>
        call.name === "nrArquivoImagem" &&
        call.data.id === data.id &&
        call.data.variante === data.variante,
    ).length;
    const state =
      mediaFallback && data.variante !== "original" && index === 3
        ? "sem_representacao"
        : mediaFallback &&
            data.variante !== "original" &&
            index === 6 &&
            sessionStorage.getItem("nrMediaDerivativesReady") === "1"
          ? "disponivel"
          : data.variante !== "original" && index === 6
            ? "processando"
            : data.variante !== "original" && index === 7
              ? "falhou"
              : "disponivel";
    return {
      estado: state,
      original_disponivel: ![2, 9, 13, 14, 16, 17].includes(index),
      variante: data.variante,
      versao: "synthetic-media-fixture-1",
      url:
        state === "disponivel"
          ? `/fixtures/nr-photo-${index === 2 ? "portrait" : "landscape"}.png?id=${index}&attempt=${count}&error=${index === 5 || index === 17 || ((index === 3 || index === 16) && count === 1) ? "403" : "none"}`
          : null,
      expira_em: state === "disponivel" ? new Date(Date.now() + 60000).toISOString() : null,
      largura: index === 2 ? 320 : 600,
      altura: index === 2 ? 560 : 400,
    };
  }
  return {
    estado: "sem_representacao",
    original_disponivel: true,
    variante: data.variante,
    versao: "isolated-unavailable",
    url: null,
    expira_em: null,
    largura: null,
    altura: null,
  };
}
export async function nrArquivoBaixar({
  data,
}: { data?: { id: string; organization_id?: string; visualizar?: boolean } } = {}) {
  if (scenario === "nr-media") {
    if (!data) throw new Error("Arquivo sintético não informado.");
    window.__nexusCalls.push({ name: "nrArquivoBaixar", data });
    await new Promise((resolve) => setTimeout(resolve, 80));
    const index = Number(data.id.slice(-12));
    return {
      url: `/fixtures/nr-photo-landscape.png?download=${Date.now()}`,
      expira_em: new Date(Date.now() + 60000).toISOString(),
      arquivo: {
        ...structuredClone(fixtureFile),
        id: data.id,
        nome: "synthetic-test-fixture.png",
        mime: "image/png",
        origem_metadata: index === 2 ? { tipo: "miniatura_origem" } : {},
      },
    };
  }
  return {
    url: "/storage/v1/object/sign/nexus-operacional/fixture-reader.pdf?token=nr-isolated",
    expira_em: new Date(Date.now() + 60000).toISOString(),
    arquivo: structuredClone(fixtureFile),
  };
}
export async function nrArquivoVersoesListar({ data }) {
  window.__nexusCalls.push({ name: "nrArquivoVersoesListar", data });
  return {
    rows: contextual
      ? [
          {
            id: "34000000-0000-4000-8000-000000000009",
            arquivo_id: data.id,
            versao_origem: "historica-sintetica-1",
            nome_original: "original-historico-de-teste.pdf",
            modificado_em: "2026-09-10",
            autor_historico: "Autor histórico sintético",
            bytes_disponiveis: false,
            arquivo_historico_id: null,
            estado: "indisponivel",
            motivo:
              "Metadados sintéticos preservados; bytes históricos não disponibilizados no laboratório.",
            mime: "application/pdf",
            tamanho_declarado: "1234",
            retencao_origem: false,
            capturado_em: "2026-10-30T12:00:00Z",
          },
        ]
      : [],
    total: contextual ? 1 : 0,
    pagina: data.pagina || 0,
    limite: data.limite || 25,
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
    id: row.modelo_versao_id || row.revisao_atual_id || modelId,
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

export async function nrDocumentoCampos({ data }) {
  window.__nexusCalls.push({ name: "nrDocumentoCampos", data });
  await new Promise((resolve) => setTimeout(resolve, 90));
  if (data.organization_id !== org || data.cliente_id !== client || data.unidade_id !== unit)
    throw new Error("Contexto sintético indisponível.");
  const local = data.local_id ? rows.locais.find((row) => row.id === data.local_id) : null;
  if (data.local_id && !local) throw new Error("Local sintético indisponível.");
  const source = (tipo, id, version) => ({
    tipo,
    id,
    version,
    sha256: "a".repeat(64),
    updated_at: common.updated_at,
  });
  return {
    contexto: { cliente_id: client, unidade_id: unit, local_id: local?.id ?? null },
    campos: [
      {
        chave: "cliente.razao_social",
        rotulo: "Razão social do cliente",
        valor: "Cliente sintético — laboratório isolado",
        fonte: source("cliente", client, 1),
      },
      {
        chave: "cliente.nome_exibicao",
        rotulo: "Nome de exibição do cliente",
        valor: "Cliente sintético",
        fonte: source("cliente", client, 1),
      },
      {
        chave: "unidade.nome",
        rotulo: "Nome da unidade",
        valor: "Unidade de testes de apresentação",
        fonte: source("unidade", unit, 1),
      },
      {
        chave: "unidade.endereco",
        rotulo: "Endereço da unidade",
        valor: null,
        fonte: source("unidade", unit, 1),
      },
      ...(local
        ? ["tag", "titulo", "descricao", "tipo", "familia"].map((key) => ({
            chave: `local.${key}`,
            rotulo: key,
            valor: local[key] ?? null,
            fonte: source("local", local.id, local.version),
          }))
        : []),
    ],
  };
}
const documentModelRequests = new Map();
export async function nrDocumentoDeModelo({ data }) {
  window.__nexusCalls.push({ name: "nrDocumentoDeModelo", data });
  if (documentModelRequests.has(data.chave))
    return structuredClone(documentModelRequests.get(data.chave));
  const model = rows.modelos.find(
    (row) => row.id === data.dados.modelo_id && row.tipo === "documento",
  );
  if (!model || model.version !== data.dados.modelo_expected_version)
    throw new Error("Modelo alterado no laboratório.");
  const resolved = await nrDocumentoCampos({
    data: { ...data.dados, organization_id: data.organization_id, norma: data.norma },
  });
  const content = structuredClone(model.conteudo);
  content.blocos = content.blocos.map((block) => {
    if (block.tipo !== "campo") return block;
    const field = resolved.campos.find((row) => row.chave === block.chave);
    if (!field) throw new Error("Campo do modelo sem contexto no laboratório.");
    return { ...block, valor_snapshot: field.valor, fonte_snapshot: field.fonte };
  });
  const row = {
    ...structuredClone(common),
    ...data.dados,
    id: crypto.randomUUID(),
    estado: "rascunho",
    conteudo: content,
    recebimento: "nativo",
    revisao_numero: 1,
    revisao_atual_id: crypto.randomUUID(),
    dados: {
      modelo_origem: {
        id: model.id,
        versao_id: data.dados.modelo_versao_id || model.modelo_versao_id,
        version: model.version,
      },
    },
  };
  rows.documentos.push(row);
  const response = { registro: structuredClone(row) };
  documentModelRequests.set(data.chave, response);
  return response;
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

// Synthetic calculation boundary: never contacts a production service.
export async function nrSalvarCalculos({ data }) {
  if (scenario === "restricted") throw new Error("Sem permissão na fixture.");
  const input = nrSalvarCalculosSchema.parse(data);
  const row = rows.locais.find((local) => local.id === input.local_id);
  if (!row || input.organization_id !== org) throw new Error("Contexto indisponível.");
  const snapshot = calcularSnapshotNr(
    input.entrada,
    "40000000-0000-4000-8000-000000000001",
    input.expected_version,
    input.chave,
  );
  return nrExecutar({
    data: {
      organization_id: org,
      norma: input.norma,
      recurso: "locais",
      comando: "salvar",
      id: row.id,
      expected_version: input.expected_version,
      chave: input.chave,
      dados: { dados: { ...row.dados, calculos: JSON.parse(JSON.stringify(snapshot)) } },
    },
  });
}
const importQueues = new Map<
  string,
  { row: Record<string, any>; items: Map<number, any>; key: string }
>();
export async function nrImportFilaPreparar({ data }) {
  if (scenario === "restricted" || data.organization_id !== org)
    throw new Error("Sem permissão na fixture.");
  const existing = [...importQueues.values()].find((q) => q.key === data.chave);
  if (existing) return structuredClone(existing.row);
  const row = {
    id: crypto.randomUUID(),
    lote_id: crypto.randomUUID(),
    norma: data.norma,
    origem: data.origem,
    estado: "preparando",
    total: data.total,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  importQueues.set(row.id, { row, items: new Map(), key: data.chave });
  return structuredClone(row);
}
export async function nrImportFilaStaging({ data }) {
  if (scenario === "restricted" || data.organization_id !== org)
    throw new Error("Sem permissão na fixture.");
  const queue = importQueues.get(data.fila_id);
  if (!queue || queue.row.estado !== "preparando") throw new Error("Fila indisponível.");
  for (const item of data.itens)
    queue.items.set(
      item.sequencia,
      structuredClone({ ...item, id: crypto.randomUUID(), estado: "fila", tentativas: 0 }),
    );
  return { confirmados: data.itens.length, recebidos: queue.items.size };
}
export async function nrImportFilaComandar({ data }) {
  if (scenario === "restricted" || data.organization_id !== org)
    throw new Error("Sem permissão na fixture.");
  const queue = importQueues.get(data.fila_id);
  if (!queue) throw new Error("Fila indisponível.");
  if (data.acao === "iniciar" && queue.items.size !== queue.row.total)
    throw new Error("Staging incompleto.");
  queue.row.estado = { iniciar: "fila", pausar: "pausado", retomar: "fila", cancelar: "cancelado" }[
    data.acao
  ];
  return structuredClone(queue.row);
}
export async function nrImportFilaConsultar({ data }) {
  if (scenario === "restricted" || data.organization_id !== org)
    throw new Error("Sem permissão na fixture.");
  const page = data.pagina || 0;
  if (!data.id)
    return {
      rows: [...importQueues.values()]
        .map((q) => ({ ...q.row, recebidos: q.items.size, processados: 0 }))
        .slice(page * 25, (page + 1) * 25),
      total: importQueues.size,
      pagina: page,
      agendador_ativo: true,
    };
  const queue = importQueues.get(data.id);
  if (!queue) throw new Error("Fila indisponível.");
  return {
    fila: structuredClone(queue.row),
    rows: [...queue.items.values()]
      .slice(page * 25, (page + 1) * 25)
      .map(({ payload, destino, ...metadata }) => metadata),
    total: queue.row.total,
    pagina: page,
    agendador_ativo: true,
    recebidos: queue.items.size,
    processados: 0,
    erros: 0,
  };
}
export async function nrPastaOrdenar({ data }) {
  if (scenario === "restricted" || data.organization_id !== org)
    throw new Error("Sem permissão na fixture.");
  const row = rows.pastas.find((folder) => folder.id === data.id);
  if (!row || row.version !== data.expected_version)
    throw new Error("Conflito de versão da pasta.");
  const siblings = rows.pastas.filter(
    (folder) => folder.parent_id === row.parent_id && !folder.arquivado_em,
  );
  const index = siblings.findIndex((folder) => folder.id === row.id),
    next = index + (data.direcao === "subir" ? -1 : 1);
  if (next < 0 || next >= siblings.length) throw new Error("A pasta já está nesta extremidade.");
  row.version++;
  return { registro: structuredClone(row) };
}
