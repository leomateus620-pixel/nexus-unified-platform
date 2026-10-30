import type { PetDetalhe, PetOpcoes } from "../../src/features/pet/ui-types";
export const ORG = "a0300000-0000-4000-8000-000000000001";
export const USER = "a0300000-0000-4000-8000-000000000002";
const supervisor = "a0300000-0000-4000-8000-000000000003",
  watch = "a0300000-0000-4000-8000-000000000004",
  worker = "a0300000-0000-4000-8000-000000000005",
  other = "a0300000-0000-4000-8000-000000000008";
const model = {
  id: "a0300000-0000-4000-8000-000000000009",
  nome: "Procedimento sintético · apresentação",
  estado: "aprovado",
  procedimento: {
    agentes: [
      { agente: "CO2", unidade: "%vol", maximo: 0.5 },
      { agente: "Benzeno", unidade: "ppm", maximo: 1 },
    ],
    itens: [{ id: "isolamento", rotulo: "Área isolada", obrigatorio: true, permite_na: false }],
    monitoramento_continuo: true,
    procedimento_resgate: "Canal local registrado na PET",
  },
};
const moment = (offset: number) => new Date(Date.now() + offset * 60_000).toISOString();
export const experienceOptions: PetOpcoes = {
  clientes: [{ id: "client", nome: "Cliente de apresentação" }],
  unidades: [{ id: "unit", nome: "Unidade de apresentação" }],
  pessoas: [
    { id: supervisor, nome: "Helena Silva · cadastro atual" },
    { id: watch, nome: "Rafael Costa · cadastro atual" },
    { id: worker, nome: "Ana Martins · cadastro atual" },
    { id: other, nome: "João Pereira · cadastro atual" },
  ],
  espacos: [],
  modelos: [model],
  ordens: [],
  integracao_assinatura: { configurada: false, mensagem: "Integração não configurada" },
};

export function experienceDetail(state: string): PetDetalhe {
  const emitted = moment(-70),
    entered = moment(-35),
    exited = moment(-12),
    end = moment(120);
  const record: PetDetalhe = {
    pet: {
      id: "a0300000-0000-4000-8000-000000000010",
      numero: "PET-2026-0018 · apresentação",
      os_id: "a0300000-0000-4000-8000-000000000011",
      unidade_id: "unit",
      espaco_id: "space",
      atividade: "Inspeção interna e verificação dos pontos de fixação do reservatório",
      estado_documental: "emitida",
      condicao_operacional: "em_atividade",
      termino_previsto: end,
      emitida_em: emitted,
      encerrada_em: null,
      version: 8,
      timezone: "America/Sao_Paulo",
      modelo_versao_id: model.id,
      revisao_atual_id: "conference",
      snapshot_identificacao: {
        cliente: { id: "client", nome: "Cliente de apresentação" },
        unidade: { id: "unit", nome: "Unidade Operacional Sul" },
        espaco: {
          id: "space",
          identificacao: "EC-04 · Reservatório de água",
          localizacao: "Bloco industrial · acesso lateral",
        },
      },
      conteudo: {
        perigos: [
          {
            grupo: "Acidentes",
            perigo: "Queda",
            medida: "Acesso protegido e pontos de ancoragem conferidos.",
            evidencia: "Registro do isolamento",
          },
        ],
        procedimentos: {
          bloqueio: "Energia isolada e bloqueada.",
          comunicacao: "Rádio no canal operacional previsto.",
          resgate: "Equipe relacionada e canal de emergência conferido.",
          dispositivo_adequado: "sim",
        },
        monitoramento_continuo: {
          confirmado: true,
          equipamento: "Detector identificado no procedimento",
          registro: "Registro contínuo do equipamento",
        },
        contatos_emergencia: "Vigia · rádio canal 3\nResgate · canal operacional 1",
      },
    },
    os: {
      id: "a0300000-0000-4000-8000-000000000011",
      numero: "OS-2026-0042",
      titulo: "Inspeção do reservatório",
      escopo: "Verificação dos pontos de fixação.",
      cliente_id: "client",
      unidade_id: "unit",
      estado: "em_execucao",
      version: 2,
    },
    espaco: { id: "space", identificacao: "EC-04 · Reservatório de água" },
    modelo: model,
    revisoes: [
      {
        id: "conference",
        finalidade: "conferencia",
        versao: 1,
        sha256: "0".repeat(64),
        conteudo: {},
      },
    ],
    participantes: [
      {
        id: "participant-supervisor",
        pessoa_id: supervisor,
        nome_snapshot: "Helena Silva",
        funcao: "supervisor",
        classificacao: "interno",
        inicio: emitted,
      },
      {
        id: "participant-watch",
        pessoa_id: watch,
        nome_snapshot: "Rafael Costa",
        funcao: "vigia",
        classificacao: "interno",
        inicio: emitted,
      },
      {
        id: "participant-worker",
        pessoa_id: worker,
        nome_snapshot: "Ana Martins",
        funcao: "trabalhador",
        classificacao: "interno",
        inicio: emitted,
      },
      {
        id: "participant-other",
        pessoa_id: other,
        nome_snapshot: "João Pereira",
        funcao: "trabalhador",
        classificacao: "terceirizado",
        empresa: "Equipe de apresentação",
        inicio: emitted,
      },
    ],
    respostas: [
      { item: "isolamento", resposta: "sim", justificativa: "Isolamento conferido em campo." },
    ],
    avaliacoes: [
      {
        id: "assessment",
        etapa: "inicial",
        momento: moment(-40),
        instrumento: "Detector de apresentação",
        numero_serie: "DEMO-0001",
        responsavel_id: supervisor,
        calibracao: "Verificação registrada para apresentação.",
        leituras: [
          { agente: "CO2", valor: 0.04, unidade: "%vol", origem: "leitura_direta" },
          { agente: "Benzeno", valor: 0, unidade: "ppm", origem: "leitura_direta" },
        ],
      },
    ],
    leituras: [],
    presencas: [
      {
        id: "entry",
        pessoa_id: worker,
        tipo: "entrada",
        momento: entered,
        momento_declarado: entered,
        origem: "online",
      },
    ],
    intervalos: [{ pessoa_id: worker, pessoa_nome: "Ana Martins", entrada_em: entered }],
    eventos: [
      {
        id: "event-issued",
        tipo: "emissao",
        momento: emitted,
        motivo:
          "Estado sintético para testar a composição de uma permissão emitida. Sem validação de emissão real.",
      },
    ],
    assinaturas: [],
    documentos: [],
    pendencias: [],
    metricas: { duracao_documental_segundos: 4200, horas_pessoa_segundos: 2100 },
    permissoes: { editar: false, operar: true, conferir: true, emitir: true, baixar: true },
  };
  if (state === "expired") record.pet.termino_previsto = moment(-5);
  if (state === "draft") {
    record.pet.estado_documental = "rascunho";
    record.pet.condicao_operacional = "nao_liberada";
    record.pet.emitida_em = null;
    record.presencas = [];
    record.intervalos = [];
    record.eventos = [];
    record.metricas = {};
    record.permissoes = {
      editar: true,
      operar: false,
      conferir: true,
      emitir: false,
      baixar: true,
    };
  }
  if (state === "interrupted") {
    record.pet.estado_documental = "encerramento_pendente";
    record.pet.condicao_operacional = "interrompida";
    record.eventos.push({
      id: "interruption",
      tipo: "interrupcao",
      momento: moment(-4),
      motivo: "Interrupção de apresentação. A saída individual permanece necessária.",
    });
  }
  if (["closing", "closing-preparation", "closed"].includes(state)) {
    record.pet.estado_documental = "encerramento_pendente";
    record.pet.condicao_operacional = "terminada";
    record.pet.termino_operacional_em = exited;
    record.intervalos[0]!.saida_em = exited;
    record.intervalos[0]!.segundos = 1380;
    record.presencas.push({
      id: "exit",
      pessoa_id: worker,
      tipo: "saida",
      momento: exited,
      momento_declarado: exited,
      origem: "online",
      assinatura_pendente: state !== "closed",
    });
    record.metricas.horas_pessoa_segundos = 1380;
    record.eventos.push({
      id: "end",
      tipo: "saida_toda_equipe",
      momento: exited,
      motivo: "Todas as presenças de apresentação estão resolvidas.",
    });
    if (state !== "closing-preparation") {
      record.pet.revisao_atual_id = "final";
      record.revisoes.push({
        id: "final",
        finalidade: "encerramento",
        versao: 2,
        sha256: "1".repeat(64),
        conteudo: {
          condicao_final:
            "Reservatório deixado isolado, acesso sinalizado e ferramentas retiradas.",
          motivo: "Inspeção finalizada com verificação de presença.",
          termino_operacional_em: exited,
        },
      });
    }
  }
  if (state === "closed") {
    record.pet.estado_documental = "encerrada";
    record.pet.encerrada_em = moment(-3);
    record.documentos = [
      {
        id: "derived-report",
        tipo: "relatorio_consulta",
        estado: "disponivel",
        sha256: "2".repeat(64),
        revisao_id: "final",
      },
    ];
    record.eventos.push({
      id: "documentary-end",
      tipo: "encerramento",
      momento: record.pet.encerrada_em,
      motivo: "Estado sintético de consulta concluída. Nenhum certificado foi criado ou validado.",
    });
  }
  if (state === "cancelled") {
    record.pet.estado_documental = "cancelada";
    record.pet.condicao_operacional = "nao_liberada";
    record.pet.emitida_em = null;
    record.presencas = [];
    record.intervalos = [];
    record.avaliacoes = [];
    record.pet.motivo_cancelamento = "Preparação cancelada antes da emissão.";
    record.eventos = [
      {
        id: "cancel",
        tipo: "cancelamento",
        momento: moment(-10),
        motivo: "Preparação cancelada antes da emissão.",
      },
    ];
  }
  if (state === "readonly")
    record.permissoes = {
      editar: false,
      operar: false,
      conferir: false,
      emitir: false,
      baixar: true,
    };
  return record;
}
