import type { ContentBlock } from "./native-content";
import type { NrJson } from "./domain";
import type { NrDocumentField } from "./document-models.schemas";

/** A new source selection never keeps the value or provenance of another key. */
export function selecionarCampoDocumento(block: ContentBlock, chave: string): ContentBlock {
  const {
    valor_snapshot: _value,
    fonte_snapshot: _source,
    motivo_substituicao: _reason,
    ...rest
  } = block;
  return { ...rest, chave, modo: chave.startsWith("local.") ? "vinculado" : "snapshot" };
}

/** Values and source versions come from the authorized relational resolver, never a text input. */
export function capturarCampoDocumento(block: ContentBlock, field: NrDocumentField): ContentBlock {
  if (block.tipo !== "campo" || field.chave !== block.chave)
    throw new Error("A resposta pertence a outro campo. Selecione e capture novamente.");
  const { motivo_substituicao: _reason, ...rest } = block;
  return {
    ...rest,
    modo: field.chave.startsWith("local.") ? "vinculado" : "snapshot",
    valor_snapshot: field.valor,
    fonte_snapshot: field.fonte as NrJson,
  };
}

export function substituirCampoDocumento(block: ContentBlock, value: string): ContentBlock {
  return {
    ...block,
    modo: "livre",
    valor_snapshot: value,
    ...(block.modo === "livre" ? {} : { motivo_substituicao: "" }),
  };
}
