import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton } from "@/components/nexus/Page";
import { nrDocumentoImagensVinculadas } from "./files.functions";
import { NrContentEditor } from "./NrContentEditor";
import { NrPhotoGallery } from "./NrPhotoGallery";
import { projectConvertedDocxImages } from "./docx-image-projection";
import { nrObject } from "./technical-display";
import type { NativeContent } from "./native-content";
import type { Norma, NrRecord } from "./domain";

export function NrConvertedDocxContent({
  row,
  norma,
  value,
  revision,
}: {
  row: NrRecord;
  norma: Norma;
  value: NativeContent;
  revision: unknown;
}) {
  const load = useServerFn(nrDocumentoImagensVinculadas);
  const assets = nrObject(nrObject(revision)["snapshot"])["assets"];
  const hasAssets = Array.isArray(assets) && assets.length > 0;
  const warnings = nrObject(nrObject(revision)["snapshot"])["avisos"];
  const shiftedFromTable =
    Array.isArray(warnings) &&
    warnings.includes("Imagens em tabelas foram deslocadas para blocos após a tabela.");
  const fileIds = Array.isArray(assets)
    ? [
        ...new Set(
          assets
            .map((asset) => nrObject(asset)["arquivo_id"])
            .filter(
              (id): id is string =>
                typeof id === "string" &&
                /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id),
            ),
        ),
      ].slice(0, 100)
    : [];
  const files = useQuery({
    queryKey: [
      "nr",
      row.organization_id,
      norma,
      "imagens-docx-revisao",
      row.id,
      row.revisao_atual_id,
      row.version,
      fileIds,
    ],
    enabled:
      hasAssets &&
      fileIds.length > 0 &&
      !!row.cliente_id &&
      !!row.unidade_id &&
      !!row.revisao_atual_id,
    queryFn: ({ signal }) =>
      load({
        data: {
          organization_id: row.organization_id,
          norma,
          documento_id: row.id,
          revisao_id: row.revisao_atual_id!,
          arquivo_ids: fileIds,
        },
        signal,
      }),
    retry: false,
  });
  const projection = projectConvertedDocxImages({
    row,
    value,
    revision,
    files: files.data?.rows ?? [],
  });
  const displayed = {
    ...value,
    blocos: value.blocos.filter((block) => !projection.projectedBlockIds.includes(block.id)),
  };
  return (
    <>
      {projection.photos.length > 0 && (
        <section aria-label="Imagens extraídas do DOCX desta revisão" className="nr-source my-4">
          <p className="nr-muted my-2">
            {shiftedFromTable
              ? "Esta conversão deslocou imagens da tabela para blocos após ela. "
              : "Esta cópia preserva imagens extraídas do documento original. "}
            A galeria torna acessíveis as imagens com identidade e vínculo comprovados com esta
            cópia e revisão. O formato editável atual não representa imagens dentro das células;
            esse posicionamento não foi reconstruído nesta visualização. Consulte o Word/PDF emitido
            para a apresentação original.
          </p>
          <NrPhotoGallery
            org={row.organization_id}
            value={projection.photos}
            context={`${row.titulo} · imagens extraídas, não fotos de campo`}
            title="Imagens extraídas do Word"
            description="Imagens já armazenadas do documento original, vinculadas à revisão desta cópia editável. Não correspondem à recuperação das fotos próprias da aplicação."
          />
        </section>
      )}
      {hasAssets && fileIds.length > 0 && files.isPending && (
        <p className="nr-muted" role="status">
          Conferindo as imagens vinculadas à revisão desta cópia…
        </p>
      )}
      {files.isError && (
        <p className="nr-feedback" role="alert">
          Não foi possível conferir a galeria desta revisão. Os blocos e arquivos originais
          permanecem disponíveis.
          <ActionButton variant="ghost" onClick={() => void files.refetch()}>
            Tentar novamente
          </ActionButton>
        </p>
      )}
      {projection.ambiguousBlockIds.length > 0 && (
        <p className="nr-source">
          Há imagens cujo arquivo é compartilhado por mais de uma parte do DOCX. Os blocos foram
          preservados abaixo; a galeria não escolheu uma parte de origem pela legenda ou pelo nome.
        </p>
      )}
      {hasAssets &&
        fileIds.length > 0 &&
        !files.isPending &&
        !files.isError &&
        projection.photos.length === 0 && (
          <p className="nr-source">
            As referências de imagens estão preservadas, mas esta consulta não confirmou identidade
            e vínculo suficientes para reuni-las automaticamente. Consulte os blocos preservados
            abaixo ou o arquivo original.
          </p>
        )}
      <NrContentEditor org={row.organization_id} value={displayed} readOnly />
    </>
  );
}
