import type { z } from "zod";
import type {
  equipeRow,
  equipeMembroDetalheRow,
  equipeDetalheSchema,
  equipeListagemSchema,
  salvarEquipeInput,
  vincularMembroInput,
  encerrarMembroInput,
} from "./schemas";

export type Equipe = z.infer<typeof equipeRow>;
export type MembroEquipe = z.infer<typeof equipeMembroDetalheRow>;
export type EquipeDetalhe = z.infer<typeof equipeDetalheSchema>;
export type EquipeListagem = z.infer<typeof equipeListagemSchema>;
export type SalvarEquipeCommand = z.infer<typeof salvarEquipeInput>;
export type VincularMembroCommand = z.infer<typeof vincularMembroInput>;
export type EncerrarMembroCommand = z.infer<typeof encerrarMembroInput>;
export type EquipesSearch = {
  busca: string;
  pagina: number;
  arquivadas: boolean;
  equipe: string;
  paginaMembros: number;
};
