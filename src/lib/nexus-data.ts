// Dados de exemplo do Sistema Nexus.
// Prontos para serem substituídos por consultas reais quando o banco for ligado.

export const dashboardKpis = [
  { label: "Propostas em aberto", value: "R$ 4,82 mi", delta: "+12% no mês", tone: "primary" },
  { label: "Projetos ativos", value: "27", delta: "6 em execução", tone: "info" },
  { label: "Margem média", value: "31,4%", delta: "+1,8 p.p.", tone: "primary" },
  { label: "Pendências críticas", value: "9", delta: "3 vencendo hoje", tone: "danger" },
] as const;

export const funilComercial = [
  { etapa: "Prospecção", quantidade: 18, valor: 2380000 },
  { etapa: "Levantamento", quantidade: 11, valor: 1740000 },
  { etapa: "Proposta enviada", quantidade: 8, valor: 1290000 },
  { etapa: "Negociação", quantidade: 5, valor: 860000 },
  { etapa: "Fechado", quantidade: 4, valor: 620000 },
];

export const faturamentoMensal = [
  { mes: "Jan", faturado: 620, custo: 430 },
  { mes: "Fev", faturado: 740, custo: 500 },
  { mes: "Mar", faturado: 910, custo: 600 },
  { mes: "Abr", faturado: 820, custo: 560 },
  { mes: "Mai", faturado: 1080, custo: 690 },
  { mes: "Jun", faturado: 1240, custo: 780 },
];

export const pendencias = [
  { item: "Laudo NR-12 — Cooperativa Vale Verde", tipo: "Documentação", prazo: "Hoje" },
  { item: "Aprovação de proposta PRP-2043", tipo: "Comercial", prazo: "Hoje" },
  { item: "Inspeção de linhas de vida — Unidade Palotina", tipo: "Inspeções", prazo: "2 dias" },
  { item: "Compra de perfis estruturais OP-118", tipo: "Compras", prazo: "3 dias" },
  { item: "Assinatura da OS 2291", tipo: "Execução", prazo: "4 dias" },
];

export const oportunidades = [
  {
    codigo: "OPT-2091",
    cliente: "Cooperativa Vale Verde",
    solucao: "Adequação NR-12 — moegas",
    valor: 486000,
    etapa: "Negociação",
    responsavel: "Camila Reis",
  },
  {
    codigo: "OPT-2088",
    cliente: "Agro Santa Clara",
    solucao: "Linhas de vida em silos",
    valor: 312000,
    etapa: "Proposta enviada",
    responsavel: "Diego Matos",
  },
  {
    codigo: "OPT-2084",
    cliente: "Usina Ipiranga Sul",
    solucao: "Espaços confinados — sinalização e resgate",
    valor: 158000,
    etapa: "Levantamento",
    responsavel: "Camila Reis",
  },
  {
    codigo: "OPT-2079",
    cliente: "Frigorífico Boa Vista",
    solucao: "Proteções fixas e intertravamento",
    valor: 742000,
    etapa: "Prospecção",
    responsavel: "Marcos Lima",
  },
];

export const propostas = [
  {
    codigo: "PRP-2043",
    cliente: "Cooperativa Vale Verde",
    versao: "v3",
    valor: 486000,
    margem: "32%",
    status: "Aguardando aprovação",
  },
  {
    codigo: "PRP-2039",
    cliente: "Agro Santa Clara",
    versao: "v1",
    valor: 312000,
    margem: "28%",
    status: "Enviada",
  },
  {
    codigo: "PRP-2031",
    cliente: "Usina Ipiranga Sul",
    versao: "v2",
    valor: 158000,
    margem: "35%",
    status: "Aprovada",
  },
];

export const clientes = [
  {
    id: "vale-verde",
    nome: "Cooperativa Vale Verde",
    cidade: "Cascavel / PR",
    unidades: 4,
    projetos: 7,
    contato: "Renata Bueno",
    situacao: "Ativo",
  },
  {
    id: "santa-clara",
    nome: "Agro Santa Clara",
    cidade: "Rio Verde / GO",
    unidades: 2,
    projetos: 3,
    contato: "Paulo Ferrari",
    situacao: "Ativo",
  },
  {
    id: "ipiranga-sul",
    nome: "Usina Ipiranga Sul",
    cidade: "Sertãozinho / SP",
    unidades: 1,
    projetos: 2,
    contato: "Helena Duarte",
    situacao: "Em prospecção",
  },
  {
    id: "boa-vista",
    nome: "Frigorífico Boa Vista",
    cidade: "Chapecó / SC",
    unidades: 3,
    projetos: 5,
    contato: "Alan Petry",
    situacao: "Ativo",
  },
];

export const produtos = [
  {
    codigo: "NX-PRT-100",
    descricao: "Proteção fixa em grade metálica 1000x800",
    ncm: "7308.90.10",
    custo: 486.3,
    fornecedor: "Metalúrgica Andrade",
    impostos: "IPI 5% / ICMS 12%",
  },
  {
    codigo: "NX-LDV-220",
    descricao: "Linha de vida horizontal em cabo de aço 8mm",
    ncm: "7312.10.90",
    custo: 1284.0,
    fornecedor: "Safe Height do Brasil",
    impostos: "IPI 0% / ICMS 12%",
  },
  {
    codigo: "NX-SEN-045",
    descricao: "Sensor de segurança magnético codificado",
    ncm: "8536.50.90",
    custo: 392.75,
    fornecedor: "Sensotec",
    impostos: "IPI 10% / ICMS 18%",
  },
  {
    codigo: "NX-ANC-012",
    descricao: "Ponto de ancoragem estrutural classe A1",
    ncm: "7326.90.90",
    custo: 268.4,
    fornecedor: "Metalúrgica Andrade",
    impostos: "IPI 5% / ICMS 12%",
  },
];

export const levantamentos = [
  {
    codigo: "LVT-0412",
    cliente: "Cooperativa Vale Verde",
    unidade: "Unidade Palotina",
    tecnico: "Rafael Nunes",
    data: "08/09/2026",
    naoConformidades: 23,
    status: "Em análise",
  },
  {
    codigo: "LVT-0409",
    cliente: "Agro Santa Clara",
    unidade: "Armazém Central",
    tecnico: "Bruna Klein",
    data: "02/09/2026",
    naoConformidades: 11,
    status: "Concluído",
  },
  {
    codigo: "LVT-0405",
    cliente: "Frigorífico Boa Vista",
    unidade: "Planta 2",
    tecnico: "Rafael Nunes",
    data: "26/08/2026",
    naoConformidades: 37,
    status: "Concluído",
  },
];

export const engenharia = [
  {
    codigo: "ENG-1187",
    tema: "Apreciação de risco — transportador de correia",
    norma: "NR-12 / ABNT NBR 14153",
    responsavel: "Eng. Tiago Alves",
    status: "Em elaboração",
  },
  {
    codigo: "ENG-1182",
    tema: "Dimensionamento de linha de vida — silo 12",
    norma: "NR-35 / ABNT NBR 16325",
    responsavel: "Eng. Marina Costa",
    status: "Aprovado",
  },
  {
    codigo: "ENG-1176",
    tema: "Classificação de espaços confinados",
    norma: "NR-33",
    responsavel: "Eng. Tiago Alves",
    status: "Revisão",
  },
];

export const projetos = [
  {
    codigo: "PRJ-0338",
    cliente: "Cooperativa Vale Verde",
    escopo: "Adequação NR-12 — moegas e transportadores",
    etapa: "Execução",
    prazo: "30/10/2026",
    avanco: 62,
  },
  {
    codigo: "PRJ-0334",
    cliente: "Agro Santa Clara",
    escopo: "Linhas de vida — 6 silos",
    etapa: "Compras/Produção",
    prazo: "18/11/2026",
    avanco: 34,
  },
  {
    codigo: "PRJ-0329",
    cliente: "Frigorífico Boa Vista",
    escopo: "Proteções fixas e intertravamento",
    etapa: "Documentação",
    prazo: "05/10/2026",
    avanco: 88,
  },
];

export const compras = [
  {
    codigo: "SC-0912",
    item: "Perfis estruturais 2\" — 340 m",
    fornecedor: "Metalúrgica Andrade",
    projeto: "PRJ-0338",
    valor: 48200,
    status: "Aguardando cotação",
  },
  {
    codigo: "SC-0908",
    item: "Cabo de aço 8mm — 480 m",
    fornecedor: "Safe Height do Brasil",
    projeto: "PRJ-0334",
    valor: 31800,
    status: "Pedido emitido",
  },
  {
    codigo: "OP-0118",
    item: "Fabricação de 24 guarda-corpos",
    fornecedor: "Produção interna",
    projeto: "PRJ-0338",
    valor: 62400,
    status: "Em fabricação",
  },
];

export const ordensServico = [
  {
    codigo: "OS-2291",
    cliente: "Cooperativa Vale Verde",
    equipe: "Equipe Alfa (4)",
    horas: 96,
    deslocamento: "412 km",
    status: "Em campo",
  },
  {
    codigo: "OS-2287",
    cliente: "Frigorífico Boa Vista",
    equipe: "Equipe Bravo (3)",
    horas: 58,
    deslocamento: "268 km",
    status: "Aguardando assinatura",
  },
  {
    codigo: "OS-2280",
    cliente: "Agro Santa Clara",
    equipe: "Equipe Alfa (4)",
    horas: 124,
    deslocamento: "702 km",
    status: "Concluída",
  },
];

export const documentos = [
  {
    codigo: "DOC-5521",
    tipo: "Laudo NR-12",
    cliente: "Cooperativa Vale Verde",
    projeto: "PRJ-0338",
    revisao: "R02",
    status: "Em revisão",
  },
  {
    codigo: "DOC-5514",
    tipo: "Memorial descritivo",
    cliente: "Agro Santa Clara",
    projeto: "PRJ-0334",
    revisao: "R01",
    status: "Emitido",
  },
  {
    codigo: "DOC-5502",
    tipo: "Dossiê técnico",
    cliente: "Frigorífico Boa Vista",
    projeto: "PRJ-0329",
    revisao: "R03",
    status: "Aprovado",
  },
];

export const inspecoes = [
  {
    codigo: "INS-0771",
    item: "Linhas de vida — Unidade Palotina",
    periodicidade: "Anual",
    ultima: "12/09/2025",
    proxima: "12/09/2026",
    status: "Vencendo",
  },
  {
    codigo: "INS-0764",
    item: "Espaços confinados — Usina Ipiranga Sul",
    periodicidade: "Semestral",
    ultima: "20/05/2026",
    proxima: "20/11/2026",
    status: "Em dia",
  },
  {
    codigo: "INS-0758",
    item: "Proteções fixas — Planta 2",
    periodicidade: "Anual",
    ultima: "02/07/2025",
    proxima: "02/07/2026",
    status: "Vencida",
  },
];

export const financeiro = [
  {
    projeto: "PRJ-0338",
    cliente: "Cooperativa Vale Verde",
    orcado: 486000,
    realizado: 302400,
    faturado: 243000,
    margem: "31%",
  },
  {
    projeto: "PRJ-0334",
    cliente: "Agro Santa Clara",
    orcado: 312000,
    realizado: 96800,
    faturado: 93600,
    margem: "28%",
  },
  {
    projeto: "PRJ-0329",
    cliente: "Frigorífico Boa Vista",
    orcado: 742000,
    realizado: 611200,
    faturado: 667800,
    margem: "18%",
  },
];

export const usuarios = [
  { nome: "Camila Reis", perfil: "Comercial", unidade: "Matriz", acesso: "Completo" },
  { nome: "Eng. Tiago Alves", perfil: "Engenharia", unidade: "Matriz", acesso: "Técnico" },
  { nome: "Rafael Nunes", perfil: "Campo", unidade: "Regional Oeste", acesso: "Levantamentos" },
  { nome: "Aline Prado", perfil: "Financeiro", unidade: "Matriz", acesso: "Financeiro" },
];

export function brl(value: number) {
  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  });
}
