/** Synthetic data exists only at the visual lab boundary. No requests reach a live organization. */
import type {
  InspecoesComando,
  InspecoesDetalhe,
  InspecoesEscopo,
  InspecoesEvento,
  InspecoesFiltro,
  InspecoesLevantamento,
  InspecoesRegistro,
  InspecoesRecurso,
  InspecoesUnidade,
} from "../../src/features/inspecoes/ui-contract";
import type {
  ContinuidadeComando,
  ContinuidadeContrato,
  ContinuidadeSegmento,
} from "../../src/features/inspecoes/continuidade.functions";
import { listarCadastrosCliente } from "./operacional-server";

const id = (n: number) => `41000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const org = id(1),
  cliente = id(2),
  unidade = id(3);
const scenario = new URLSearchParams(location.search).get("scenario");
const tst = scenario === "insp-tst";
const maintenance = scenario === "insp-maintenance";
const user = tst ? id(7) : id(8);
const activeUnits: InspecoesUnidade[] = [];
const contracts: (ContinuidadeContrato & { unidadeId: string })[] = [];
const history = new Map<string, InspecoesEvento[]>();
const corrections = new Map<string, { versao: number; nota: string }>();
let attemptedCorrection = false;

function recordEvent(
  entityId: string,
  entry: Pick<InspecoesEvento, "evento" | "versao" | "motivo" | "antes" | "depois">,
) {
  const events = history.get(entityId) ?? [];
  events.unshift({
    ...entry,
    id: crypto.randomUUID(),
    autor: "Administrador de Validação",
    ocorridoEm: "2026-11-13T13:30:00.000Z",
  });
  history.set(entityId, events);
}
const file = new URL("./fixtures/nr-photo-landscape.png", import.meta.url).href;
const pdf = new URL("./fixtures/nexus-original-isolado.pdf", import.meta.url).href;
declare const __NEXUS_PDF_FIXTURE__: { tamanho: number; tamanhoGrande: number; sha256: string };
const mock = (
  entry: Partial<InspecoesRegistro> & Pick<InspecoesRegistro, "id" | "colecao" | "titulo">,
): InspecoesRegistro => ({
  cliente_id: cliente,
  unidade_id: unidade,
  source_id: entry.id,
  codigo: null,
  familia: null,
  situacao: null,
  data_ref: "2026-09-21",
  vigente: true,
  existente: true,
  ...entry,
});
const document = mock({
  id: id(10),
  colecao: "documentos",
  titulo: "Laudo de pontos de ancoragem da Unidade Norte",
  codigo: "NX-2026-01",
  situacao: "emitido",
  resumo: { revisao: "R00", r64_status: "em_aviso", vence: "2027-01-22" },
});
const plan = mock({
  id: id(11),
  colecao: "plantas",
  titulo: "Planta de pontos de ancoragem",
  codigo: "PL-01",
  situacao: "vigente",
});
const assets = Array.from({ length: 149 }, (_, index) => {
  const tag = `${index < 104 ? "PAC" : "PAL"}-${String(index + 1).padStart(3, "0")}`;
  return mock({
    id: id(100 + index),
    colecao: "ativos",
    titulo: `Ponto de ancoragem ${tag}`,
    codigo: tag,
    familia: "ANC",
    situacao: "em_uso",
    resumo: {
      local: "Edificação principal",
      setor: index % 2 ? "Cobertura" : "Fachada",
      zona_laudo: index === 0 ? "A2" : "A1",
      resultado: index % 3 === 0 ? "apto_restricao" : "apto",
      r64_status: index % 3 === 0 ? "em_aviso" : "em_dia",
      vence: "2027-01-22",
    },
  });
});
const issue = mock({
  id: id(20),
  colecao: "pendencias",
  titulo: "Conferir identificação em campo",
  situacao: "aberta",
  resumo: { criticidade: "alta" },
});
const due = mock({
  id: id(21),
  colecao: "vencimentos",
  titulo: "Ciclo da Unidade Norte",
  situacao: "em_aviso",
  resumo: { vence: "2027-01-22", r64_status: "em_aviso" },
});
const otherDocuments = [
  mock({
    id: id(12),
    colecao: "documentos",
    titulo: "Relatório de ensaio de linha de vida",
    codigo: "NX-2026-03",
    situacao: "recebido",
    resumo: { revisao: "R01" },
  }),
  mock({
    id: id(13),
    colecao: "documentos",
    titulo: "Inspeção de guarda-corpos da unidade",
    codigo: "NX-2026-04",
    situacao: "emitido",
    resumo: { revisao: "R00", r64_status: "em_dia", vence: "2027-09-21" },
  }),
];
const records = [document, plan, ...otherDocuments, ...assets, issue, due];
const photoFiles = Array.from({ length: 6 }, (_, index) => ({
  id: id(300 + index),
  nome: `foto-${index + 1}.png`,
  papel: "foto",
  estado: "original_verificado",
  mime: "image/png",
  bytes: 2048,
  sha256: "a".repeat(64),
  miniaturaUrl: file,
  previaUrl: file,
  originalUrl: file,
  legenda: "Teste de carga com dinamômetro.",
}));
const points = assets.map((item, index) => {
  const row = Math.floor(index / 28),
    column = index % 28;
  const x = 91 + column * 36 + (row % 2 ? 7 : 0);
  const y = 116 + row * 104 + (column % 3) * 8;
  return {
    ativo_id: item.source_id,
    tag: item.codigo,
    tipo: index < 104 ? "PAC" : "PAL",
    x,
    y,
    raio: 5,
    rotulo: { x: x + 7, y: y - 4, tam: 7 },
  };
});
const snapshot = {
  largura_pt: 1190,
  altura_pt: 842,
  formato: "A3",
  revisao: "R00",
  folha: "Folha 1",
  zonas: {
    colunas: [20, 165, 310, 455, 600, 745, 890, 1035, 1170],
    linhas: [20, 180, 340, 500, 660, 820],
    rot_colunas: ["1", "2", "3", "4", "5", "6", "7", "8"],
    rot_linhas: ["A", "B", "C", "D", "E"],
  },
  tipos: [
    { sigla: "PAC", cor: "#9a1422" },
    { sigla: "PAL", cor: "#204c8a" },
  ],
  geometria: {
    paths: [
      { d: "M70 75 L1125 75 L1125 680 L70 680 Z", cor: "#233d34", fill: "#f4f9f5", w: 3 },
      {
        d: "M80 154 L1115 154 L1115 255 L80 255 Z M80 362 L1115 362 L1115 460 L80 460 Z M80 576 L1115 576 L1115 667 L80 667 Z",
        cor: "#778f83",
        fill: "none",
        w: 2,
      },
      {
        d: "M335 75 L335 680 M590 75 L590 680 M840 75 L840 680",
        cor: "#47665c",
        fill: "none",
        w: 1.6,
      },
    ],
    textos: [
      { t: "FACHADA NORTE", x: 84, y: 61, tam: 10 },
      { t: "COBERTURA · PLANTA DE CONFERÊNCIA", x: 86, y: 710, tam: 10 },
    ],
  },
  pontos: points,
};

let levantamento: InspecoesLevantamento = {
  id: id(40),
  organization_id: org,
  cliente_id: cliente,
  unidade_id: unidade,
  ativo_id: assets[0].id,
  estado: tst ? "rascunho" : "em_revisao",
  tipo: "T1",
  version: 2,
  atribuido_a: user,
  created_by: id(8),
  data_inspecao: "2026-09-21",
  conteudo: {
    data_inspecao: "2026-09-21",
    protocolo: "NX-ANC-01",
    codigo_documento: "NX-2026-02",
    revisao_documento: "R00",
    respostas: { F01: "C", F02: "CR" },
  },
  checklist: [
    { id: "F01", item: "Conferir identificação do ponto", critico: true },
    { id: "F02", item: "Inspecionar condição superficial" },
  ],
  resultado_calculado: "apto_restricao",
  calculo_justificativa: "Item com restrição.",
  bloqueios: ["Homologue o protocolo desta família e tipo com o checklist aplicável."],
};

export async function inspecoesContexto() {
  const longContext = scenario === "insp-long-context";
  const administrador = scenario === "insp-admin" || maintenance;
  const clientName = longContext
    ? "Indústria de Sistemas de Proteção e Manutenção"
    : "Cliente de Validação";
  return {
    administrador,
    atribuicoes: administrador
      ? []
      : [
          {
            id: id(6),
            perfil: tst ? "TST" : "EST",
            pessoa_id: user,
            nome: tst
              ? "Técnico de Campo"
              : longContext
                ? "Responsável Técnica de Inspeções e Proteção contra Quedas"
                : "Responsável Técnica",
            cliente_id: null,
            unidade_id: null,
            ensaios: false,
            biblioteca: !tst,
            importacao: !tst,
          },
        ],
    unidades: [
      {
        cliente_id: cliente,
        unidade_id: unidade,
        cliente_nome: clientName,
        unidade_nome: longContext
          ? "Unidade Operacional Santa Rosa — Linha de Vida"
          : "Unidade Norte",
        segmento: "IN",
      },
      {
        cliente_id: cliente,
        unidade_id: id(4),
        cliente_nome: clientName,
        unidade_nome: "Unidade Sul",
        segmento: "IN",
      },
      {
        cliente_id: id(5),
        unidade_id: id(9),
        cliente_nome: "Oficina de Validação",
        unidade_nome: "Unidade Central",
        segmento: "CC",
      },
      ...activeUnits,
    ],
  };
}

export async function inspecoesAcessosListar() {
  return {
    total: 1,
    membros: [
      {
        user_id: user,
        nome: "Administrador de Validação",
        email: null,
        pessoa_id: null,
        tem_registro: false,
        qualificacoes: [],
        atribuicoes: [],
      },
    ],
  };
}

export async function inspecoesAcessosHistorico() {
  return { total: 0, eventos: [] };
}

export async function inspecoesAcessosExecutar() {
  throw new Error("A organização isolada ainda não possui qualificações.");
}
export async function inspecoesListar({ data }: { data: InspecoesFiltro }) {
  const rows = records.filter(
    (item) =>
      item.colecao === data.recurso &&
      (!data.clienteId || item.cliente_id === data.clienteId) &&
      (!data.unidadeId || item.unidade_id === data.unidadeId) &&
      (!data.busca ||
        [item.titulo, item.codigo].some((v) =>
          v?.toLocaleLowerCase("pt-BR").includes(data.busca.toLocaleLowerCase("pt-BR")),
        )),
  );
  return {
    items: rows.slice(data.pagina * 24, (data.pagina + 1) * 24),
    total: rows.length,
    pageSize: 24,
  };
}
export async function inspecoesPainel({ data }: { data: InspecoesEscopo }) {
  const counts: [InspecoesRecurso, string, string][] = [
    ["documentos", "", "Documentos"],
    ["ativos", "vigentes", "Ativos vigentes"],
    ["pendencias", "", "Pendências registradas"],
    ["vencimentos", "em_aviso", "Grupos em aviso · R64"],
  ];
  const indicadores = await Promise.all(
    counts.map(async ([recurso, estado, label]) => ({
      recurso,
      estado,
      label,
      total: (
        await inspecoesListar({
          data: { ...data, recurso, estado, ordem: "recente", pagina: 0, busca: "" },
        })
      ).total,
    })),
  );
  return {
    indicadores,
    recentes: data.unidadeId && data.unidadeId !== unidade ? [] : [document, issue],
  };
}
export async function inspecoesDetalhe({
  data,
}: {
  data: { id: string };
}): Promise<InspecoesDetalhe> {
  const registro = records.find((item) => item.id === data.id);
  if (!registro) throw new Error("Registro indisponível no contexto autorizado.");
  return {
    registro: {
      ...registro,
      acervo_versao: corrections.get(registro.id)?.versao ?? 0,
      nota_acervo: corrections.get(registro.id)?.nota ?? null,
      snapshot:
        registro.id === plan.id
          ? snapshot
          : registro.id === document.id
            ? {
                revisao: "R00",
                resumo: "Conferência dos pontos de ancoragem e inspeção da área técnica.",
                historico: [],
                original_situacao: "disponivel_verificado",
              }
            : (registro.resumo ?? {}),
    },
    relacionados:
      registro.id === document.id || registro.id === plan.id
        ? [registro.id === document.id ? plan : document, ...assets]
        : registro.colecao === "ativos"
          ? [document, plan, issue]
          : [],
    arquivos:
      registro.id === document.id
        ? [
            {
              id: id(399),
              nome: "laudo-de-validacao.pdf",
              papel: "original",
              estado: "original_verificado",
              mime: "application/pdf",
              bytes: __NEXUS_PDF_FIXTURE__.tamanho,
              sha256: __NEXUS_PDF_FIXTURE__.sha256,
              originalUrl: pdf,
            },
            ...photoFiles,
          ]
        : registro.id === id(12)
          ? [
              {
                id: id(398),
                nome: "relatorio-extenso.pdf",
                papel: "original",
                estado: "original_verificado",
                mime: "application/pdf",
                bytes: __NEXUS_PDF_FIXTURE__.tamanhoGrande,
                sha256: "f".repeat(64),
              },
            ]
          : [],
  };
}
export async function inspecoesArquivoUrl({
  data,
}: {
  data: { id: string; acao?: "visualizar" | "baixar" | "verificar" };
}) {
  const permitido = !window.document.body.hasAttribute("data-insp-revoked");
  const ranged = window.document.body.hasAttribute("data-insp-ignore-range")
    ? "/storage/v1/object/sign/inspecoes-acervo/fixture-grande.pdf?token=insp-ignore-range"
    : "/storage/v1/object/sign/inspecoes-acervo/fixture-grande.pdf?token=insp-range";
  return {
    permitido,
    url:
      !permitido || data.acao === "verificar"
        ? null
        : data.id === id(399)
          ? pdf
          : data.id === id(398)
            ? ranged
            : file,
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
  };
}
export async function inspecoesLevantamentos({ data }: { data: { ativoId: string } }) {
  return { items: data.ativoId === assets[0].id ? [levantamento] : [], candidatos: [] };
}
export async function inspecoesExecutar({ data }: { data: InspecoesComando }) {
  if (tst && ["aprovar", "devolver", "emitir"].includes(data.comando))
    throw new Error("Atribuição EST exigida.");
  if (data.comando === "salvar") levantamento = { ...levantamento, conteudo: data.dados };
  if (data.comando === "submeter") levantamento = { ...levantamento, estado: "em_revisao" };
  if (data.comando === "devolver")
    levantamento = { ...levantamento, estado: "rascunho", devolucao: data.dados.motivo };
  levantamento = { ...levantamento, version: levantamento.version + 1 };
  return levantamento;
}
export const inspecoesLimiteEnvio = 20 * 1024 * 1024;
export async function inspecoesAnexosPorAlvo() {
  return { files: [], history: [], total: 0, pageSize: 50 };
}
export async function inspecoesUploadReservar() {
  throw new Error("Envio real desabilitado no laboratório.");
}
export async function inspecoesUploadConfirmar() {
  throw new Error("Envio real desabilitado no laboratório.");
}
export async function inspecoesUploadCancelar() {
  return true;
}

export async function inspecoesContinuidadeContratos({ data }: { data: InspecoesEscopo }) {
  const selected = contracts.filter((item) => item.unidadeId === data.unidadeId);
  return {
    contratos: structuredClone(selected),
    segmento: activeUnits.find((item) => item.unidade_id === data.unidadeId)?.segmento ?? "IN",
    total: selected.length,
    limite: 20,
  };
}
export async function inspecoesContinuidadeCiclos() {
  return { ciclos: [], total: 0, limite: 20 };
}
export async function inspecoesContinuidadeOpcoes() {
  return { propostas: [], pacotes: [], ordens: [] };
}
export async function inspecoesContinuidadeExecutar({
  data,
}: {
  data: InspecoesEscopo & { comando: ContinuidadeComando };
}) {
  const command = data.comando;
  if (!maintenance || command.acao !== "criar_contrato" || !data.unidadeId)
    throw new Error("Operação externa desabilitada no laboratório.");
  const contract: (typeof contracts)[number] = {
    unidadeId: data.unidadeId,
    id: crypto.randomUUID(),
    titulo: command.titulo,
    referencia: command.referencia ?? null,
    segmento: "IN",
    estado: "rascunho",
    version: 1,
    inicio: command.inicio ?? null,
    fim: command.fim ?? null,
    situacao_prazo: null,
    cancelado_em: null,
    cancelamento_motivo: null,
    proposta: null,
    pacote: null,
  };
  contracts.unshift(contract);
  recordEvent(contract.id, {
    evento: "criar_contrato",
    versao: 1,
    motivo: null,
    antes: null,
    depois: { titulo: contract.titulo, referencia: contract.referencia },
  });
  return { contrato_id: contract.id };
}
export async function inspecoesCampoConsultar() {
  return { ensaios: [], pontos: [], evidencias: [], total: 0, pageSize: 20 };
}
export async function inspecoesAtivoCriar() {
  throw new Error("Operação externa desabilitada no laboratório.");
}
export async function inspecoesEnsaioSalvar() {
  throw new Error("Operação externa desabilitada no laboratório.");
}
export async function inspecoesEnsaioCancelar() {
  throw new Error("Operação externa desabilitada no laboratório.");
}

export async function inspecoesProtocoloAtual() {
  return null;
}
export async function inspecoesHomologarProtocolo() {
  throw new Error("Operação externa desabilitada no laboratório.");
}

export async function inspecoesAtivarUnidade({
  data,
}: {
  data: {
    organizationId: string;
    clienteId: string;
    unidadeId: string;
    segmento: ContinuidadeSegmento;
    motivo: string;
  };
}) {
  if (!maintenance) throw new Error("Ativação desabilitada neste cenário.");
  if (activeUnits.some((row) => row.unidade_id === data.unidadeId)) return true;
  const scope = {
    organization_id: data.organizationId,
    cliente_id: data.clienteId,
    situacao: "ativos",
  };
  const [{ rows: clients }, { rows: units }] = await Promise.all([
    listarCadastrosCliente({ data: { ...scope, grupo: "clientes" } }),
    listarCadastrosCliente({ data: { ...scope, grupo: "unidades" } }),
  ]);
  const clientRow = clients.find((row: { id: string }) => row.id === data.clienteId);
  const unitRow = units.find((row: { id: string }) => row.id === data.unidadeId);
  if (!clientRow || !unitRow) throw new Error("Cadastro não encontrado no contexto isolado.");
  activeUnits.push({
    cliente_id: data.clienteId,
    unidade_id: data.unidadeId,
    cliente_nome: clientRow.nome_exibicao ?? clientRow.razao_social,
    unidade_nome: unitRow.nome,
    segmento: data.segmento,
  });
  recordEvent(data.unidadeId, {
    evento: "unidade_incluida",
    versao: null,
    motivo: data.motivo,
    antes: null,
    depois: { segmento: data.segmento },
  });
  return true;
}
export async function inspecoesAcervoSalvar({
  data,
}: {
  data: {
    id: string | null;
    versao: number;
    chave: string;
    dados: { titulo: string; nota: string; motivo: string };
  };
}) {
  const record = records.find((row) => row.id === data.id);
  if (!maintenance || !record) throw new Error("A edição está indisponível neste cenário.");
  const keys = window.document.body.dataset["inspCorrectionKeys"];
  window.document.body.dataset["inspCorrectionKeys"] = keys ? `${keys},${data.chave}` : data.chave;
  if (!attemptedCorrection) {
    attemptedCorrection = true;
    throw new Error("Falha simulada. O preenchimento pode ser reenviado.");
  }
  const anterior = corrections.get(record.id);
  if ((anterior?.versao ?? 0) !== data.versao) throw new Error("A versão da ficha mudou.");
  const versao = data.versao + 1;
  recordEvent(record.id, {
    evento: "correcao_acervo",
    versao,
    motivo: data.dados.motivo,
    antes: { titulo: record.titulo, nota: anterior?.nota ?? null },
    depois: { titulo: data.dados.titulo, nota: data.dados.nota },
  });
  record.titulo = data.dados.titulo;
  corrections.set(record.id, { versao, nota: data.dados.nota });
  return { id: record.id, versao };
}
export async function inspecoesApresentacaoSalvar({
  data,
}: {
  data: { id: string; versao: number };
}) {
  return { id: data.id, versao: data.versao + 1 };
}
export async function inspecoesHistorico({ data }: { data: { id: string } }) {
  return { eventos: structuredClone(history.get(data.id) ?? []), mais: false };
}
