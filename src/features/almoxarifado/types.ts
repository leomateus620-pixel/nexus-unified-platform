import type { z } from "zod";
import type {
  buscarOpcoesAlmoxarifadoSchema,
  calibracaoFerramentaRow,
  comandoAlmoxarifadoSchema,
  conferenciaEstoqueRow,
  condicaoFerramentaSchema,
  estadoReservaEstoqueSchema,
  custodiaFerramentaRow,
  detalheAlmoxarifadoSchema,
  ferramentaEstoqueRow,
  inventarioEstoqueRow,
  listaAlmoxarifadoSchema,
  listarAlmoxarifadoSchema,
  localEstoqueRow,
  materialEstoqueRow,
  movimentoEstoqueRow,
  obterAlmoxarifadoSchema,
  opcaoAlmoxarifadoRow,
  permissoesAlmoxarifadoSchema,
  politicaCalibracaoRow,
  quantidadesReservaEstoqueRow,
  saldoEstoqueRow,
  reservaEstoqueRow,
  resultadoComandoAlmoxarifadoSchema,
  tipoConsultaEstoqueSchema,
  tipoDetalheEstoqueSchema,
  tipoOpcaoAlmoxarifadoSchema,
} from "./schemas";

export type TipoConsultaEstoque = z.infer<typeof tipoConsultaEstoqueSchema>;
export type TipoDetalheEstoque = z.infer<typeof tipoDetalheEstoqueSchema>;
export type TipoOpcaoAlmoxarifado = z.infer<typeof tipoOpcaoAlmoxarifadoSchema>;
export type EstadoReservaEstoque = z.infer<typeof estadoReservaEstoqueSchema>;
export type CondicaoFerramenta = z.infer<typeof condicaoFerramentaSchema>;
export type SaldoEstoque = z.infer<typeof saldoEstoqueRow>;
export type QuantidadesReservaEstoque = z.infer<typeof quantidadesReservaEstoqueRow>;
export type OpcaoAlmoxarifado = z.infer<typeof opcaoAlmoxarifadoRow>;
export type PermissoesAlmoxarifado = z.infer<typeof permissoesAlmoxarifadoSchema>;
export type ListarAlmoxarifado = z.input<typeof listarAlmoxarifadoSchema>;
export type ObterAlmoxarifado = z.input<typeof obterAlmoxarifadoSchema>;
export type BuscarOpcoesAlmoxarifado = z.input<typeof buscarOpcoesAlmoxarifadoSchema>;
export type MaterialEstoque = z.infer<typeof materialEstoqueRow>;
export type LocalEstoque = z.infer<typeof localEstoqueRow>;
export type ConferenciaEstoque = z.infer<typeof conferenciaEstoqueRow>;
export type MovimentoEstoque = z.infer<typeof movimentoEstoqueRow>;
export type ReservaEstoque = z.infer<typeof reservaEstoqueRow>;
export type FerramentaEstoque = z.infer<typeof ferramentaEstoqueRow>;
export type CustodiaFerramenta = z.infer<typeof custodiaFerramentaRow>;
export type CalibracaoFerramenta = z.infer<typeof calibracaoFerramentaRow>;
export type PoliticaCalibracao = z.infer<typeof politicaCalibracaoRow>;
export type InventarioEstoque = z.infer<typeof inventarioEstoqueRow>;
export type AlmoxarifadoLista = z.infer<typeof listaAlmoxarifadoSchema>;
export type AlmoxarifadoDetalhe = z.infer<typeof detalheAlmoxarifadoSchema>;
export type ComandoAlmoxarifado = z.input<typeof comandoAlmoxarifadoSchema>;
export type ResultadoComandoAlmoxarifado = z.infer<typeof resultadoComandoAlmoxarifadoSchema>;

export type AlmoxarifadoFiltros = {
  busca?: string;
  estado?: string | null;
  local_id?: string | null;
  pagina?: number;
  limite?: number;
};
