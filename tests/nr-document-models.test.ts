import { describe, expect, it } from "vitest";
import {
  capturarCampoDocumento,
  selecionarCampoDocumento,
  substituirCampoDocumento,
} from "../src/features/nr/document-fields";
import {
  nrDocumentFieldsInput,
  nrDocumentFieldsOutput,
  nrDocumentFromModelInput,
} from "../src/features/nr/document-models.schemas";
import { parseNative, type ContentBlock } from "../src/features/nr/native-content";
const id = (n: number) => `10000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const source = {
  tipo: "local" as const,
  id: id(4),
  version: 3,
  sha256: "a".repeat(64),
  updated_at: "2026-10-30T12:00:00Z",
};
const field = {
  chave: "local.tag" as const,
  rotulo: "TAG do local",
  valor: "EC 001 13A",
  fonte: source,
};
const block: ContentBlock = { id: "tag", tipo: "campo", chave: "local.tag", modo: "vinculado" };
const input = () => ({
  organization_id: id(1),
  norma: "NR33",
  chave: id(8),
  dados: {
    cliente_id: id(2),
    unidade_id: id(3),
    local_id: id(4),
    modelo_id: id(5),
    modelo_versao_id: id(6),
    modelo_expected_version: 4,
    titulo: "Documento sintético a partir de modelo",
    usar_rascunho: true,
    normas: ["NR33"],
  },
});
describe("documentos a partir de modelos e capturas relacionais", () => {
  it("exige modelo, contexto, versão esperada e chave estável sem aceitar corpo ou aprovação no cliente", () => {
    expect(nrDocumentFromModelInput.parse(input()).dados.modelo_versao_id).toBe(id(6));
    const { modelo_expected_version: _version, ...dados } = input().dados;
    expect(nrDocumentFromModelInput.safeParse({ ...input(), dados }).success).toBe(false);
    for (const extras of [
      { conteudo: { schema_version: 1, blocos: [] } },
      { estado: "emitido" },
      { aprovado_por: id(7) },
    ])
      expect(
        nrDocumentFromModelInput.safeParse({ ...input(), dados: { ...input().dados, ...extras } })
          .success,
      ).toBe(false);
    expect(
      nrDocumentFromModelInput.safeParse({ ...input(), chave: "nome-do-modelo" }).success,
    ).toBe(false);
  });
  it("distingue captura atual de versão preservada e valida o escopo das normas", () => {
    const { modelo_versao_id: _revision, ...dados } = input().dados;
    expect(
      nrDocumentFromModelInput.parse({ ...input(), dados }).dados.modelo_versao_id,
    ).toBeUndefined();
    for (const normas of [["NR35"], ["NR33", "NR33"]])
      expect(
        nrDocumentFromModelInput.safeParse({ ...input(), dados: { ...dados, normas } }).success,
      ).toBe(false);
  });
  it("resolve somente valores permitidos com origem e versão correspondentes", () => {
    expect(nrDocumentFieldsOutput.parse({ campos: [field], contexto: {} }).campos[0]?.valor).toBe(
      "EC 001 13A",
    );
    for (const invalid of [
      { ...field, chave: "local.capacidade_validada" },
      { ...field, fonte: { ...source, tipo: "cliente" } },
      { ...field, fonte: { ...source, version: null } },
      { ...field, fonte: { ...source, sha256: "url" } },
    ])
      expect(nrDocumentFieldsOutput.safeParse({ campos: [invalid], contexto: {} }).success).toBe(
        false,
      );
    expect(
      nrDocumentFieldsInput.safeParse({
        organization_id: id(1),
        norma: "NR33",
        cliente_id: id(2),
        unidade_id: id(3),
        local_id: "EC 01",
      }).success,
    ).toBe(false);
  });
  it("trocar chave remove valor, autoria e motivo da captura anterior", () => {
    const captured = capturarCampoDocumento(block, field);
    const selected = selecionarCampoDocumento(
      { ...captured, modo: "livre", motivo_substituicao: "Correção justificada" },
      "unidade.nome",
    );
    expect(selected.chave).toBe("unidade.nome");
    expect(selected.modo).toBe("snapshot");
    expect(selected).not.toHaveProperty("valor_snapshot");
    expect(selected).not.toHaveProperty("fonte_snapshot");
    expect(selected).not.toHaveProperty("motivo_substituicao");
  });
  it("captura preserva zeros e proveniência; resposta de outra chave não preenche o bloco", () => {
    const captured = capturarCampoDocumento(block, field);
    expect(captured.valor_snapshot).toBe("EC 001 13A");
    expect(captured.fonte_snapshot).toEqual(source);
    expect(() => capturarCampoDocumento({ ...block, chave: "local.titulo" }, field)).toThrow(
      "outro campo",
    );
    expect(
      parseNative({ schema_version: 1, blocos: [captured] })?.blocos[0]?.fonte_snapshot,
    ).toEqual(source);
  });
  it("substituição manual mantém o snapshot de origem e exige motivo para persistir", () => {
    const captured = capturarCampoDocumento(block, field);
    const manual = substituirCampoDocumento(captured, "EC 001 13A · texto ajustado");
    expect(manual.modo).toBe("livre");
    expect(manual.fonte_snapshot).toEqual(source);
    expect(parseNative({ schema_version: 1, blocos: [manual] })).toBeNull();
    expect(
      parseNative({
        schema_version: 1,
        blocos: [{ ...manual, motivo_substituicao: "Ajuste editorial motivado" }],
      }),
    ).not.toBeNull();
  });
});
