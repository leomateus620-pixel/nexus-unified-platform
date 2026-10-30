import { conteudoNrSchema } from "./schemas";
import type { NrJson } from "./domain";
export type ContentBlock = {
  id: string;
  tipo: "titulo" | "paragrafo" | "tabela" | "imagem" | "referencia" | "campo";
  texto?: string;
  linhas?: string[][];
  arquivo_id?: string;
  legenda?: string;
  chave?: string;
  modo?: "vinculado" | "snapshot" | "livre";
  valor_snapshot?: NrJson;
  motivo_substituicao?: string;
};
export type NativeContent = { schema_version: 1; blocos: ContentBlock[] };
/** Estruturas desconhecidas permanecem preservadas e não entram no editor suportado. */
export function parseNative(value: unknown): NativeContent | null {
  const result = conteudoNrSchema.safeParse(value);
  return result.success ? (result.data as NativeContent) : null;
}
