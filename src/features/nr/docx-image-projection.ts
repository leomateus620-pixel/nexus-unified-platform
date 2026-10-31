import type { NrRecord } from "./domain";
import type { NativeContent } from "./native-content";
const object = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const canonical = (value: unknown) =>
  JSON.stringify(value, (_, item: unknown) =>
    item && typeof item === "object" && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)))
      : item,
  );

/** Read-only gallery projection. It does not infer a table cell from its label or an image name. */
export function projectConvertedDocxImages(input: {
  row: NrRecord;
  value: NativeContent;
  revision: unknown;
  files: unknown[];
}) {
  const { row, value } = input,
    revision = object(input.revision),
    snapshot = object(revision["snapshot"]),
    conversion = object(row.dados["conversao"]),
    context = object(snapshot["contexto"]);
  const originalId = conversion["original_arquivo_id"] ?? row.dados["arquivo_original_id"],
    originalHash = conversion["original_sha256"] ?? row.dados["sha256_original"];
  const photos: Record<string, unknown>[] = [],
    projectedBlockIds: string[] = [],
    ambiguousBlockIds: string[] = [];
  if (
    revision["id"] !== row.revisao_atual_id ||
    revision["documento_id"] !== row.id ||
    canonical(revision["conteudo"]) !== canonical(value) ||
    snapshot["tipo"] !== "derivado_docx_editavel" ||
    typeof originalId !== "string" ||
    typeof originalHash !== "string" ||
    snapshot["arquivo_original_id"] !== originalId ||
    snapshot["source_sha256"] !== originalHash ||
    context["cliente_id"] !== row.cliente_id ||
    context["unidade_id"] !== row.unidade_id ||
    !Array.isArray(snapshot["assets"])
  )
    return { photos, projectedBlockIds, ambiguousBlockIds, eligible: false };
  const assets = snapshot["assets"].map(object);
  const retainedBlocks = object(snapshot["conteudo"])["blocos"];
  for (const block of value.blocos) {
    if (block.tipo !== "imagem" || !block.arquivo_id) continue;
    // A deduplicated binary may represent several OOXML parts. A free-text caption is
    // never a key. Use an occurrence key only when both retained/current blocks have it.
    const retained = Array.isArray(retainedBlocks)
      ? retainedBlocks
          .map(object)
          .find(
            (entry) =>
              entry["id"] === block.id &&
              entry["tipo"] === "imagem" &&
              entry["arquivo_id"] === block.arquivo_id,
          )
      : undefined;
    const occurrenceKey = block.chave && retained?.["chave"] === block.chave ? block.chave : null;
    const candidates = [
      ...new Map(
        assets
          .filter(
            (entry) =>
              entry["arquivo_id"] === block.arquivo_id &&
              (!occurrenceKey || entry["chave_ooxml"] === occurrenceKey),
          )
          .map((entry) => [
            canonical({
              arquivo_id: entry["arquivo_id"],
              chave_ooxml: entry["chave_ooxml"],
              sha256: entry["sha256"],
              mime: entry["mime"],
              tamanho: entry["tamanho"],
            }),
            entry,
          ]),
      ).values(),
    ];
    if (candidates.length > 1) {
      ambiguousBlockIds.push(block.id);
      continue;
    }
    const asset = candidates[0],
      file = input.files.map(object).find((entry) => entry["id"] === block.arquivo_id);
    if (
      !asset ||
      !file ||
      file["organization_id"] !== row.organization_id ||
      file["estado"] !== "vinculado" ||
      file["bytes_verificados"] !== true ||
      file["sha256"] !== asset["sha256"] ||
      file["mime"] !== asset["mime"] ||
      file["tamanho"] !== asset["tamanho"] ||
      !String(file["mime"]).startsWith("image/")
    )
      continue;
    const links = Array.isArray(file["contextos"]) ? file["contextos"].map(object) : [];
    const matches = (entry: Record<string, unknown>) =>
      entry["organization_id"] === row.organization_id &&
      entry["cliente_id"] === row.cliente_id &&
      entry["unidade_id"] === row.unidade_id &&
      entry["documento_id"] === row.id &&
      entry["revisao_id"] === row.revisao_atual_id &&
      (!row.local_id || entry["local_id"] === row.local_id);
    if (!matches(file) && !links.some(matches)) continue;
    const extraction = object(file["origem_metadata"])["extracoes"];
    const exactExtraction =
      Array.isArray(extraction) &&
      extraction
        .map(object)
        .some(
          (entry) =>
            entry["arquivo_docx_id"] === originalId &&
            entry["source_sha256"] === originalHash &&
            entry["chave_ooxml"] === asset["chave_ooxml"] &&
            entry["image_sha256"] === asset["sha256"],
        );
    const exactLink = links.filter(matches).some((link) => {
      const evidence = object(link["evidencia"]);
      return (
        evidence["arquivo_original_id"] === originalId &&
        evidence["source_sha256"] === originalHash &&
        evidence["chave_ooxml"] === asset["chave_ooxml"] &&
        evidence["image_sha256"] === asset["sha256"]
      );
    });
    if (!exactExtraction && !exactLink) continue;
    const caption =
      block.legenda && !/^word\/media\//.test(block.legenda)
        ? block.legenda
        : `Imagem ${photos.length + 1} extraída do DOCX`;
    photos.push({
      arquivo_id: block.arquivo_id,
      legenda: caption,
      categoria: "Imagem do DOCX · revisão desta cópia",
      arquivo: asset["chave_ooxml"],
      origem: "Extração comprovada do DOCX original",
      ...(block.legenda && block.legenda !== caption ? { legenda_original: block.legenda } : {}),
    });
    projectedBlockIds.push(block.id);
  }
  return { photos, projectedBlockIds, ambiguousBlockIds, eligible: true };
}
