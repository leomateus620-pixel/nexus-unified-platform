import type { DocumentoNativo } from "./schemas";

export type PeProjeto = {
  id: string;
  organization_id: string;
  titulo: string;
  descricao: string;
  cliente_id: string;
  unidade_id: string | null;
  responsavel_id: string;
  local_descritivo: string;
  visibilidade: "organizacao" | "restrito";
  arquivado: boolean;
  vigente_id: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  clientes: { razao_social: string } | null;
  unidades: { nome: string } | null;
  pessoas: { nome: string } | null;
};
export type PeVersao = {
  id: string;
  projeto_id: string;
  numero: number;
  parent_id: string | null;
  estado: "rascunho" | "em_revisao" | "congelada";
  elaborado_em: string | null;
  autor_declarado: string;
  revisao_declarada: string;
  resumo: string;
  modelo: DocumentoNativo;
  snapshot: {
    schema_version: number;
    projeto: { id: string; titulo: string; cliente: string; unidade: string | null; local: string };
    versao: {
      id: string;
      numero: number;
      elaborado_em: string | null;
      autor_declarado: string;
      revisao_declarada: string;
      resumo: string;
    };
    modelo: DocumentoNativo;
  } | null;
  snapshot_sha256: string | null;
  version: number;
  created_at: string;
};
export type PeCenario = {
  id: string;
  base_id: string;
  titulo: string;
  modelo: DocumentoNativo;
  promovida_id: string | null;
  descartado: boolean;
  version: number;
};
export type PeDetalhe = {
  projeto: PeProjeto;
  versoes: Omit<PeVersao, "modelo" | "snapshot">[];
  cenarios: Omit<PeCenario, "modelo">[];
  eventos: { id: number; comando: string; motivo: string | null; created_at: string }[];
  arquivos: {
    id: string;
    nome: string;
    estado: string;
    tamanho: number;
    sha256: string;
    versao_id: string;
  }[];
};
export type PeResultado = {
  projeto: PeProjeto;
  versao: PeVersao | null;
  cenario: PeCenario | null;
};
