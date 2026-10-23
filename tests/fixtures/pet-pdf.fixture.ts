import type { Json } from "../../src/features/pet/schemas";

/** Controlled document data for automated PDF checks only. Never imported by app code. */
export function petPdfFixture(rows = 18): Record<string, Json> {
  return {
    servidor_em: "2026-10-23T03:41:17Z",
    pet: {
      id: "pet-documento-teste",
      numero: "PET-DEMONSTRACAO",
      version: 3,
      organization_id: "organizacao-teste",
      cliente_id: "cliente-teste",
      unidade_id: "unidade-teste",
      espaco_id: "espaco-teste",
      os_id: "os-teste",
      modelo_versao_id: "modelo-aprovacao-pendente",
      revisao_atual_id: "revisao-teste",
      atividade:
        "DEMONSTRAÇÃO CONTROLADA - inspeção do espaço; rascunho sem autorização operacional.",
      estado_documental: "rascunho",
      condicao_operacional: "nao_liberada",
      validade_temporal: "nao_emitida",
      timezone: "America/Sao_Paulo",
      emitida_em: null,
      termino_previsto: "2026-10-23T10:00:00Z",
      termino_operacional_em: null,
      encerrada_em: null,
      snapshot_identificacao: {
        organizacao: "Nexus - ambiente de testes",
        cliente: "Cliente preservado na revisão",
        unidade: "Unidade preservada",
        espaco: {
          identificacao: "EC-Demonstração",
          localizacao: "Localização preservada na revisão",
        },
      },
      conteudo: {
        perigos: [
          {
            grupo: "Químicos",
            perigo: "Atmosfera perigosa",
            medida: "Procedimento sujeito à aprovação técnica",
            evidencia: "Referência de evidência de demonstração",
          },
        ],
        procedimentos: {
          bloqueio: "Identificação dos bloqueios da ocorrência",
          ventilacao_tipo: "Mecânica",
          ventilacao_minutos: "12,5",
          dispositivo_adequado: "Conferência técnica pendente",
        },
        monitoramento_continuo: {
          confirmado: false,
          equipamento: "Detector de demonstração",
          registro: "Sem comprovação de monitoramento contínuo",
        },
        contatos_emergencia: "Contato de teste; nenhum acionamento efetivo",
        outras_informacoes:
          "H₂S e O₂ são apresentados com unidades. • Verificação de diacríticos: ação, vigência, proteção.",
      },
    },
    os: { id: "os-teste", numero: "OS-TESTE", titulo: "Serviço demonstrativo" },
    espaco: { identificacao: "Nome cadastral alterado", localizacao: "Local cadastral alterado" },
    participantes: [
      {
        id: "participante-1",
        pessoa_id: "pessoa-1",
        nome_snapshot: "Pessoa de Demonstração",
        funcao: "trabalhador",
        classificacao: "interno",
        empresa: null,
        inicio: "2026-10-23T02:00:00Z",
        fim: null,
        contato: "Contato controlado",
      },
    ],
    respostas: Array.from({ length: rows }, (_, i) => ({
      item: `Controle preventivo ${String(i + 1).padStart(3, "0")}`,
      resposta: i % 2 ? "nao_aplicavel" : "nao_verificado",
      justificativa:
        "Justificativa de teste para inspeção da quebra de página e da legibilidade do relatório. Não constitui conferência de campo.",
      conferido_por: "usuario-teste",
      conferido_em: "2026-10-23T02:10:00Z",
    })),
    avaliacoes: [
      {
        id: "avaliacao-1",
        etapa: "inicial",
        momento: "2026-10-23T02:25:00Z",
        instrumento: "Instrumento de teste",
        numero_serie: "SERIE-TESTE",
        responsavel_id: "pessoa-1",
        calibracao: "Somente demonstração, sem validade operacional",
        contexto: "Teste de PDF",
        recebido_em: "2026-10-23T02:25:20Z",
      },
    ],
    leituras: [
      {
        avaliacao_id: "avaliacao-1",
        agente: "O₂",
        valor: 20.9,
        unidade: "%vol",
        origem: "manual_demonstracao",
      },
    ],
    presencas: [
      {
        id: "evento-de-teste",
        pessoa_id: "pessoa-1",
        participante_id: "participante-1",
        tipo: "saida",
        momento_declarado: "2026-10-23T03:40:00Z",
        recebido_em: "2026-10-23T03:41:00Z",
        origem: "offline",
        assinatura_pendente: true,
        assinatura_id: null,
        created_by: "vigia-registrante-teste",
      },
    ],
    // Deliberately differs from wall-clock subtraction: tests must prove the PDF
    // renders the server's supplied duration rather than creating another engine.
    intervalos: [
      {
        pessoa_id: "pessoa-1",
        pessoa_nome: "Pessoa de Demonstração",
        entrada_em: "2026-10-23T02:40:00Z",
        saida_em: "2026-10-23T03:40:00Z",
        segundos: 17,
      },
    ],
    metricas: { duracao_documental_segundos: 0, horas_pessoa_segundos: 17, presentes: 0 },
    eventos: [
      {
        tipo: "interrupcao",
        momento: "2026-10-23T03:20:00Z",
        motivo: "Exemplo de ocorrência controlada",
        created_by: "usuario-teste",
        dados: { observacao: "Demonstração" },
      },
    ],
    prorrogacoes: [],
    assinaturas: [
      {
        id: "assinatura-pendente",
        pessoa_id: "pessoa-1",
        finalidade: "saida",
        metodo: "coletada_tela",
        estado: "pendente",
        declaracao: "Declaração individual de teste, sem certificação",
        conteudo_sha256: "a".repeat(64),
        revisao_id: "revisao-teste",
        evento_em: "2026-10-23T03:40:00Z",
        assinada_em: null,
        provedor: null,
        provedor_id: null,
        identidade_verificada: null,
        validacao: null,
      },
    ],
    revisoes: [
      {
        id: "revisao-teste",
        versao: 3,
        finalidade: "conferencia",
        sha256: "b".repeat(64),
        created_at: "2026-10-23T02:20:00Z",
      },
    ],
    documentos: [
      {
        id: "original-teste",
        tipo: "original_assinado",
        estado: "solicitado",
        sha256: null,
        anexo_id: null,
        revisao_id: "revisao-teste",
        original_documento_id: null,
      },
    ],
    anexos: [
      {
        nome: "Evidência controlada",
        pet_item: "isolamento",
        legenda: "Não representa condição real de campo",
        created_by: "usuario-teste",
        created_at: "2026-10-23T02:15:00Z",
        estado: "pendente",
        sha256: "c".repeat(64),
      },
    ],
    pendencias: [
      { codigo: "integracao", mensagem: "Integração não configurada: assinatura ICP-Brasil" },
    ],
  };
}
