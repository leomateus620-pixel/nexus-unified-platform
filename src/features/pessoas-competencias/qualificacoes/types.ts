import type { z } from "zod";
import type * as schemas from "./schemas";

export type Competencia = z.infer<typeof schemas.competenciaRow>;
export type CompetenciaDetalhe = z.infer<typeof schemas.competenciaDetalhe>;
export type Qualificacao = z.infer<typeof schemas.qualificacaoListaRow>;
export type QualificacaoDetalhe = z.infer<typeof schemas.qualificacaoDetalhe>;
export type EstadoQualificacao = z.infer<typeof schemas.estadoQualificacao>;
export type SalvarCompetencia = z.infer<typeof schemas.salvarCompetenciaInput>;
export type SalvarQualificacao = z.infer<typeof schemas.salvarQualificacaoInput>;
export type TransicionarQualificacao = z.infer<typeof schemas.transicionarQualificacaoInput>;
export type QualificacoesSearch = {
  area: "competencias" | "qualificacoes";
  busca: string;
  pagina: number;
  arquivadas: boolean;
  competencia: string;
  qualificacao: string;
  pessoaFiltro: string;
  estado: string;
};
