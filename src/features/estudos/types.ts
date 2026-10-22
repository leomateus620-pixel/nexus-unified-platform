import type { z } from "zod";
import type {
  comandoEstudoSchema,
  estadoEstudoSchema,
  estudoAcaoRow,
  estudoArquivoRow,
  estudoDecisaoRow,
  estudoDetalheSchema,
  estudoEventoRow,
  estudoFonteRow,
  estudoListaRow,
  estudoMedidaRow,
  estudoPerigoRow,
  estudoPermissoesSchema,
  estudoRevisaoRow,
  estudoRow,
  estudoSubmissaoRow,
  fonteBibliograficaSchema,
  metodoEstudoVersaoRow,
  publicarMetodoEstudoSchema,
  tipoEstudoSchema,
} from "./schemas";

export type TipoEstudo = z.infer<typeof tipoEstudoSchema>;
export type EstadoEstudo = z.infer<typeof estadoEstudoSchema>;
export type Estudo = z.infer<typeof estudoRow>;
export type EstudoListaItem = z.infer<typeof estudoListaRow>;
export type EstudoRevisao = z.infer<typeof estudoRevisaoRow>;
export type EstudoPerigo = z.infer<typeof estudoPerigoRow>;
export type EstudoMedida = z.infer<typeof estudoMedidaRow>;
export type EstudoFonte = z.infer<typeof estudoFonteRow>;
export type EstudoSubmissao = z.infer<typeof estudoSubmissaoRow>;
export type EstudoDecisao = z.infer<typeof estudoDecisaoRow>;
export type EstudoArquivo = z.infer<typeof estudoArquivoRow>;
export type EstudoAcao = z.infer<typeof estudoAcaoRow>;
export type EstudoEvento = z.infer<typeof estudoEventoRow>;
export type EstudoMetodo = z.infer<typeof metodoEstudoVersaoRow>;
export type FonteBibliografica = z.infer<typeof fonteBibliograficaSchema>;
export type EstudoPermissoes = z.infer<typeof estudoPermissoesSchema>;
export type EstudoDetalhe = z.infer<typeof estudoDetalheSchema>;
export type ComandoEstudo = z.input<typeof comandoEstudoSchema>;
export type PublicarMetodoEstudo = z.input<typeof publicarMetodoEstudoSchema>;
export type EstudosLista = {
  rows: EstudoListaItem[];
  total: number;
  page: number;
  pageSize: number;
  permissoes: { criar: boolean; publicar_metodo: boolean };
};
