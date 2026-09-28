export type SaveDifference = {
  objeto: string;
  campo: string;
  nome: string;
  antes: string | number | boolean | null;
  depois: string | number | boolean | null;
  antes_rotulo?: string | null;
  depois_rotulo?: string | null;
  justificativa: string | null;
  autores: { autor: string | null; autor_nome: string | null }[];
};
export type ProposalSaveEvent = {
  id: string;
  revisao_id: string;
  autor: string;
  autor_nome: string;
  created_at: string;
  versao_origem: number;
  versao_destino: number;
  objetos: number;
  campos: number;
  diferencas: SaveDifference[];
  calculo_id: string | null;
  impacto: { total_anterior: number | null; total_calculado: number | null } | null;
};
