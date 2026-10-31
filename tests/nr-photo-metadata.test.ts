import { describe, expect, it } from "vitest";
import { editPhotoMetadata, readPhotoEdit } from "../src/features/nr/photo-metadata";
import { findPhotoOccurrenceLink, photoOccurrences } from "../src/features/nr/technical-evidence";

const ids = new Map([
  ["0", "11111111-1111-4111-8111-111111111111"],
  ["1", "22222222-2222-4222-8222-222222222222"],
]);
const source = [
  {
    arquivo: "fotos/igual.jpg",
    legenda: "Primeiro contexto",
    caption: "Alias preservado",
    grupo: "Acessos",
    autor: "Autoria histórica",
    atributo: [1, 2],
  },
  { arquivo: "fotos/igual.jpg", legenda: "Segundo contexto", grupo: "Resgate" },
];
describe("edição contextual de fotografias", () => {
  it("usa overrides explícitos inclusive vazios, preservando todos os aliases e o valor salvo", () => {
    const before = structuredClone(source);
    const changed = editPhotoMetadata(source, "0", { legenda: "", categoria: "" }, ids);
    expect(source).toEqual(before);
    expect((changed as typeof source)[0]).toMatchObject(source[0]!);
    expect(photoOccurrences(changed)[0]).toMatchObject({
      caption: "",
      category: "",
      sourceOrder: 0,
    });
    expect(photoOccurrences(source)[0]?.caption).toBe("Primeiro contexto");
  });
  it("reordena ocorrências repetidas por identidade sem mudar ordem física, origem ou associação", () => {
    const changed = editPhotoMetadata(source, "0", { move: 1 }, ids) as Record<string, unknown>[];
    expect(changed.map((entry) => entry.legenda)).toEqual(source.map((entry) => entry.legenda));
    const photos = photoOccurrences(changed);
    expect(photos.map((photo) => photo.caption)).toEqual(["Segundo contexto", "Primeiro contexto"]);
    expect(photos.map((photo) => photo.sourceOrder)).toEqual([1, 0]);
    expect(new Set(photos.map((photo) => photo.key)).size).toBe(2);
    const links = [0, 1].map((ordem) => ({
      campo: "fotos",
      ordem,
      referencia_original: "fotos/igual.jpg",
      id: `ocorrencia-${ordem}`,
    }));
    expect(
      photos.map(
        (photo) => findPhotoOccurrenceLink(links, photo.sourcePath, photo.sourceOrder)?.id,
      ),
    ).toEqual(["ocorrencia-1", "ocorrencia-0"]);
    const edited = editPhotoMetadata(changed, "1", { legenda: "Revisão contextual" }, new Map());
    expect(photoOccurrences(edited).map((photo) => photo.key)).toEqual(
      photos.map((photo) => photo.key),
    );
    expect(photoOccurrences(edited)[0]?.caption).toBe("Revisão contextual");
    expect(readPhotoEdit((edited as unknown[])[1])?.ordem_origem).toBe(1);
  });
  it("mantém mapa e referências textuais, ignora metadados inválidos e não move além do limite", () => {
    const map = { "0": "fotos/a.jpg", "1": { arquivo: "fotos/b.jpg", desconhecido: { x: true } } };
    const changed = editPhotoMetadata(map, "0", { legenda: "Nova legenda" }, ids) as Record<
      string,
      unknown
    >;
    expect(changed["0"]).toMatchObject({ arquivo: map["0"] });
    expect(changed["1"]).toMatchObject(map["1"]);
    expect(editPhotoMetadata(map, "0", { move: -1 }, ids)).toBe(map);
    expect(
      readPhotoEdit({
        edicao_foto_nexus: { schema_version: 1, ocorrencia_id: "falso", ordem: 0, ordem_origem: 0 },
      }),
    ).toBeNull();
  });
});
