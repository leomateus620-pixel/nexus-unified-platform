import type { z } from "zod";
import type {
  adocaoPreviewRow,
  comandoLevantamentoSchema,
  estadoLevantamentoSchema,
  levantamentoAdocaoRow,
  levantamentoArquivoRow,
  levantamentoAvaliacaoRow,
  levantamentoDetalheSchema,
  levantamentoListaRow,
  levantamentoMedicaoRow,
  levantamentoModeloRow,
  levantamentoPermissoesSchema,
  levantamentoPontoRow,
  levantamentoRevisaoRow,
  levantamentoRow,
  medicaoDadosSchema,
  pontoDadosSchema,
} from "./schemas";

export type EstadoLevantamento = z.infer<typeof estadoLevantamentoSchema>;
export type Levantamento = z.infer<typeof levantamentoRow>;
export type LevantamentoListaItem = z.infer<typeof levantamentoListaRow>;
export type LevantamentoRevisao = z.infer<typeof levantamentoRevisaoRow>;
export type LevantamentoPonto = z.infer<typeof levantamentoPontoRow>;
export type LevantamentoMedicao = z.infer<typeof levantamentoMedicaoRow>;
export type LevantamentoAvaliacao = z.infer<typeof levantamentoAvaliacaoRow>;
export type LevantamentoArquivo = z.infer<typeof levantamentoArquivoRow>;
export type LevantamentoAdocao = z.infer<typeof levantamentoAdocaoRow>;
export type LevantamentoModelo = z.infer<typeof levantamentoModeloRow>;
export type LevantamentoPermissoes = z.infer<typeof levantamentoPermissoesSchema>;
export type LevantamentoDetalhe = z.infer<typeof levantamentoDetalheSchema>;
export type MedicaoDados = z.infer<typeof medicaoDadosSchema>;
export type PontoDados = z.infer<typeof pontoDadosSchema>;
export type ComandoLevantamento = z.input<typeof comandoLevantamentoSchema>;
export type PreviaAdocaoLevantamento = z.infer<typeof adocaoPreviewRow>;
export type LevantamentosLista = {
  rows: LevantamentoListaItem[];
  total: number;
  page: number;
  pageSize: number;
};
