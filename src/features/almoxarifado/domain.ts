/** PostgreSQL é a autoridade dos saldos; este módulo só apresenta estados e erros. */
export const ALMOXARIFADO_ACESSO_INDISPONIVEL =
  "Registro de almoxarifado indisponível para seu acesso atual.";

export function acessoAlmoxarifadoNegado(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    error.message === ALMOXARIFADO_ACESSO_INDISPONIVEL
  );
}

/** Validação de indivisibilidade para o formulário; não confirma disponibilidade. */
export function quantidadeFracionada(quantidade: string): boolean {
  return /[.,]\d*[1-9]/.test(quantidade);
}

export const tiposConsultaEstoque = {
  materiais: "Materiais",
  ferramentas: "Ferramentas",
  movimentos: "Movimentações",
  conferencias: "Recebimentos e conferência",
  reservas: "Reservas e retiradas",
  inventarios: "Inventário",
  locais: "Locais de estoque",
} as const;

export const estadosReservaEstoque = {
  ativa: "Ativa",
  retirada: "Em retirada",
  concluida: "Concluída",
  cancelada: "Cancelada",
} as const;

export const condicoesFerramenta = {
  disponivel: "Disponível",
  avariada: "Avariada",
  quarentena: "Em quarentena",
  manutencao: "Em manutenção",
  desativada: "Desativada",
} as const;
