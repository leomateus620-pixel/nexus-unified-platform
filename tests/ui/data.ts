// Synthetic data is confined to this test entry point. No application route imports this module.
import { PARAMETROS_MODELO, REGRAS_MODELO } from "@/features/calculo/domain";
export const query = new URLSearchParams(location.search);
export const scenario = query.get("scenario") || "normal";
export const count = scenario === "empty" ? 0 : Number(query.get("count") || 17);
window.__nexusCalls = [];
window.__nexusNavigations = [];
const descriptions = [
  "Pilar de ancoragem para sistema de proteção contra quedas",
  "Cabo de aço galvanizado com alma de fibra — fornecimento por metro",
  "Conjunto de fixação e interface para cobertura metálica",
  "Absorvedor de energia com indicador de impacto",
];
const components = Array.from({ length: count }, (_, i) => ({
  id: `component-${i}`,
  codigo: `COMP-${String(i + 1).padStart(3, "0")}`,
  descricao:
    i === 0
      ? "Conjunto de ancoragem para linha de vida horizontal — cobertura industrial da unidade de recebimento e armazenagem, incluindo interface com estrutura metálica e identificação permanente"
      : descriptions[i % descriptions.length],
  unidade: i % 4 === 1 ? "m" : "un",
  fabricante: "Fornecedor de teste",
  ncm: "7326.90.90",
  modalidade: i % 3 === 0 ? "fabricar" : "comprar",
  fornecedor_id: "supplier-fixture",
  fornecedores: { nome: "Suprimentos industriais — teste" },
  custo_adotado: i === 0 ? 12345.6789 : 12.94 + i * 10,
  custo_origem_id: "catalog-fixture",
  justificativa: null,
}));
const systems = Array.from({ length: count }, (_, i) => ({
  id: `system-${i}`,
  identificacao:
    i === 0
      ? "Pavilhão de recebimento • passarela norte"
      : `Setor ${String(i + 1).padStart(2, "0")} — cobertura industrial`,
  tipo: i % 2 === 0 ? "OVERHEAD" : "TELHADO",
  metragem: i % 2 === 0 ? 120 : 80,
  trechos: i % 2 === 0 ? 4 : 1,
  ordem: i + 1,
  origem: "manual",
  organization_id: "org-fixture",
  revisao_id: "rev-fixture",
}));
const totals = {
  parcelas_12x: Array(12).fill(145946.2308),
  parcelas_50_30_20: [632769.56, 379661.736, 253107.824],
  materiais: 1245789.12,
  montagem: 498315.65,
  item_tecnico: 19750,
  desconto: 12500,
  final: 1751354.77,
  base: 1763854.77,
  margem: 0.28,
  resultado: 490379.34,
  metragem_telhado: 640,
  metragem_overhead: 4320,
  cabo_total: 5172,
  dias_equipe: 43,
  viagens: 9,
  mao_de_obra: 54123.45,
  alimentacao: 9675,
  hospedagem: 18060,
  combustivel: 1595.36,
  engenharia: 4320,
  operacao: 87773.81,
  custo_materiais: 923410.17,
  impostos_materiais: 121223.4,
  impostos_servicos: 45223.81,
};
const summary = {
  totais: totals,
  pendencias: ["Validação da Engenharia pendente para fórmulas de pilares/intermediárias."],
  por_sistema: systems.map((s) => ({
    sistema_id: s.id,
    extensao_m: s.tipo === "OVERHEAD" ? 480 : 80,
    cabo_m: s.tipo === "OVERHEAD" ? 500 : 84,
    venda_materiais: 73500,
    custo_materiais: 41000,
  })),
  por_componente: components.map((c) => ({
    componente_id: c.id,
    codigo: c.codigo,
    quantidade: 20,
    custo: c.custo_adotado,
    preco_unit: 249.2345,
    total_venda: 4984.69,
    total_custo: 2945.13,
  })),
};
const proposal = {
  id: "proposal-fixture",
  numero: "054/26",
  titulo: "Proteção de acesso e manutenção industrial",
  revisao_corrente_id: "rev-fixture",
  projeto_id: "project-fixture",
  clientes: {
    razao_social: "Cooperativa Industrial — Unidade de teste",
    cnpj: "00.000.000/0000-00",
    cidade: "Santa Rosa",
    uf: "RS",
  },
  unidades: {
    nome: "Recebimento e armazenagem de grãos",
    endereco: "Endereço sintético para revisão visual",
  },
  contatos: { nome: "Contato de teste", email: "contato@example.invalid" },
};
const revision = {
  id: "rev-fixture",
  proposta_id: proposal.id,
  numero: 5,
  status: scenario === "readonly" ? "enviada" : "rascunho",
  parametros: PARAMETROS_MODELO,
  regras_snapshot: REGRAS_MODELO,
  totais: scenario === "unavailable" ? null : summary,
  propostas: proposal,
  desatualizada: scenario === "pending",
  textos: {
    objeto: "Instalação de sistemas de proteção para manutenção e acesso industrial.",
    validade: "30 dias",
    garantia: "5 anos",
    condicoes: "Frete incluso. Condições comerciais sujeitas à emissão da proposta.",
    responsavel_tecnico: "Responsável de teste",
  },
  created_at: "2026-09-27T12:00:00Z",
  motor_versao: "nexus-calc-1.1.0",
};
const orderItems = components.slice(0, 4).map((c, i) => ({
  id: `order-item-${i}`,
  quantidade: 20,
  quantidade_recebida: 7,
  quantidade_cancelada: 0,
  quantidade_produzida: 5,
  preco_unitario: 249.2345,
  ficha_tecnica: i === 0 ? null : "Ficha de teste — sem validação técnica",
  demandas: { revisao_componentes: c },
}));
const order = {
  id: "order-fixture",
  numero: "OC-2026-0042",
  status: scenario === "issued" ? "emitida" : "rascunho",
  fornecedores: { nome: "Suprimentos industriais — teste", cnpj: "00.000.000/0000-00" },
  proposta_revisoes: {
    id: revision.id,
    numero: revision.numero,
    proposta_id: proposal.id,
    propostas: { numero: proposal.numero },
  },
  projetos: { id: "project-fixture", codigo: "PRJ-054" },
  frete: 450,
  condicoes: "Pagamento em 30 dias após emissão",
  entrega_prevista: "2026-10-30",
  responsavel: "Equipe de produção",
  prazo: "2026-11-10",
  ordem_compra_itens: orderItems,
  ordem_producao_itens: orderItems,
};
export const tables = {
  proposta_revisoes: [revision],
  propostas: Array.from({ length: count }, (_, i) => ({
    ...proposal,
    id: `proposal-${i}`,
    numero: `${String(54 + i).padStart(3, "0")}/26`,
    created_at: revision.created_at,
    revisao: { ...revision, propostas: undefined },
  })),
  revisao_componentes: components,
  sistemas_dimensionados: systems,
  sistema_componentes: systems.flatMap((s) =>
    components.slice(0, 4).map((c, i) => ({
      id: `${s.id}-${c.id}`,
      sistema_id: s.id,
      revisao_id: revision.id,
      quantidade: 12 + i,
      quantidade_tecnica: 12 + i,
      memoria: "Quantidade calculada pelo motor (fixture isolada)",
      override_quantidade: null,
      revisao_componentes: c,
    })),
  ),
  fornecedores: [
    {
      id: "supplier-fixture",
      nome: "Suprimentos industriais — teste",
      cnpj: "00.000.000/0000-00",
      contato: "Contato de teste",
    },
  ],
  demandas: components.map((c, i) => ({
    id: `demand-${i}`,
    modalidade: c.modalidade,
    quantidade_necessaria: 20,
    quantidade_planejada: 20,
    status: "planejada",
    revisao_componentes: c,
    ordem_compra_itens: [
      {
        quantidade: 12,
        quantidade_recebida: 7,
        quantidade_cancelada: 0,
        ordens_compra: { id: order.id, numero: order.numero, status: "emitida" },
      },
    ],
    ordem_producao_itens: [
      {
        quantidade: 12,
        quantidade_produzida: 5,
        ordens_producao: { id: order.id, numero: "OP-2026-0011", status: "liberada" },
      },
    ],
  })),
  documentos: [],
  ordens_compra: [order],
  ordens_producao: [
    { ...order, numero: "OP-2026-0011", status: scenario === "issued" ? "liberada" : "rascunho" },
  ],
  auditoria: [
    {
      id: "audit-fixture",
      created_at: revision.created_at,
      entidade: "revisao_componentes",
      acao: "alteração",
      motivo: "Atualização de custo justificada — fixture isolada",
      autor: "Usuário de teste",
    },
  ],
  calculo_execucoes: [
    { id: "calc-fixture", created_at: revision.created_at, motor_versao: revision.motor_versao },
  ],
};
export const supabase = {
  auth: { signOut: async () => ({ error: null }) },
  from(table) {
    let single = false,
      mutation = null,
      payload = null;
    const filters = [];
    const builder = new Proxy(
      {},
      {
        get(_, name) {
          if (name === "then")
            return (resolve) => {
              if (mutation) window.__nexusCalls.push({ table, mutation, payload, filters });
              const error =
                scenario === "error"
                  ? { message: "Falha simulada no ambiente isolado de teste" }
                  : null;
              const data = tables[table] || [];
              return Promise.resolve({ data: single ? data[0] : data, error }).then(resolve);
            };
          return (...args) => {
            if (name === "single" || name === "maybeSingle") single = true;
            if (["update", "insert", "delete", "upsert"].includes(name)) {
              mutation = name;
              payload = args[0];
            }
            if (["eq", "in"].includes(name)) filters.push([name, ...args]);
            return builder;
          };
        },
      },
    );
    return builder;
  },
};
