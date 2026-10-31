import { useId } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, LoadingState } from "@/components/nexus/Page";
import { nrRevisaoDetalhe } from "./history.functions";
import {
  hasLegacySnapshotSignature,
  legacySnapshotFieldLabel,
  proveLegacySnapshotContent,
} from "./legacy-snapshot";
import { NrContentEditor } from "./NrContentEditor";
import { NrPhotoGallery } from "./NrPhotoGallery";
import { NrConvertedDocxContent } from "./NrConvertedDocxContent";
import { nrLabel, nrObject, NrValue } from "./technical-display";
import type { NativeContent } from "./native-content";
import type { Norma, NrRecord } from "./domain";

const references = new Set([
  "arquivo",
  "miniatura",
  "caminho",
  "path",
  "url",
  "source_path",
  "arquivo_origem",
]);
const sectionLabels: Record<string, string> = {
  identificacao: "Identificação",
  geometria: "Geometria e dimensões",
  ventilacao: "Ventilação",
  calculo: "Memorial de cálculo preservado",
  ventilacao_fixa: "Ventilação fixa",
  calculo_fixo: "Cálculo da ventilação fixa",
  resgate: "Resgate",
  itens: "Itens de avaliação",
  aberturas: "Aberturas e acessos",
  atividades: "Atividades previstas",
  cadastro: "Cadastro e responsabilidades",
  fotos: "Fotos do snapshot",
  energias: "Energias e isolamento",
  epis: "Equipamentos de proteção individual",
};
const label = (key: string, section = "") =>
  legacySnapshotFieldLabel(section, key) ?? sectionLabels[key] ?? nrLabel(key);
const isPhoto = (value: unknown) => {
  const item = nrObject(value);
  return (
    typeof item["arquivo"] === "string" ||
    typeof item["arquivo_id"] === "string" ||
    typeof item["miniatura"] === "string"
  );
};
function LegacyValue({
  value,
  org,
  context,
  section,
}: {
  value: unknown;
  org: string;
  context: string;
  section: string;
}) {
  if (Array.isArray(value)) {
    if (value.length && value.every(isPhoto))
      return <NrPhotoGallery org={org} value={value} context={context} />;
    return value.length ? (
      <ul className="space-y-3">
        {value.map((item, index) => (
          <li key={index}>
            <LegacyValue
              value={item}
              org={org}
              context={`${context} · registro ${index + 1}`}
              section={section}
            />
          </li>
        ))}
      </ul>
    ) : (
      <p className="nr-muted">Nenhum registro informado</p>
    );
  }
  if (!value || typeof value !== "object") return <NrValue value={value} />;
  if (isPhoto(value)) return <NrPhotoGallery org={org} value={[value]} context={context} />;
  const entries = Object.entries(nrObject(value)),
    primary = entries.filter(([key]) => !references.has(key)),
    secondary = entries.filter(([key]) => references.has(key));
  return (
    <>
      <dl className="nr-technical-facts">
        {primary.map(([key, item]) => (
          <div key={key}>
            <dt>{label(key, section)}</dt>
            <dd>
              <LegacyValue
                value={item}
                org={org}
                context={`${context} · ${label(key, section)}`}
                section={section}
              />
            </dd>
          </div>
        ))}
      </dl>
      {secondary.length > 0 && (
        <details className="text-sm my-3">
          <summary className="nr-muted cursor-pointer">Referências preservadas da origem</summary>
          <dl className="mt-2">
            {secondary.map(([key, item]) => (
              <div key={key}>
                <dt className="font-medium">{label(key, section)}</dt>
                <dd className="break-all">
                  <NrValue value={item} />
                </dd>
              </div>
            ))}
          </dl>
        </details>
      )}
    </>
  );
}
function LegacySnapshotView({
  snapshot,
  org,
  context,
}: {
  snapshot: unknown;
  org: string;
  context: string;
}) {
  const id = useId();
  const entries = Object.entries(nrObject(snapshot));
  return (
    <div aria-label="Leitura estruturada do snapshot documental preservado">
      <p className="nr-source">
        Consulta estruturada do snapshot histórico desta revisão. O original emitido permanece nos
        arquivos vinculados.
      </p>
      <nav
        aria-label="Seções do snapshot documental"
        className="flex flex-wrap gap-x-4 gap-y-2 my-4"
      >
        {entries.map(([key]) => (
          <a
            key={key}
            href={`#${id}-${key}`}
            className="underline text-sm min-h-9 inline-flex items-center"
          >
            {label(key)}
          </a>
        ))}
      </nav>
      {entries.map(([key, value]) => (
        <section key={key} id={`${id}-${key}`} className="nr-technical-section scroll-mt-28">
          <h3>{label(key)}</h3>
          <LegacyValue
            value={value}
            org={org}
            context={`${context} · ${label(key)}`}
            section={key}
          />
        </section>
      ))}
    </div>
  );
}

/** Uses only the authorized selected revision; an import-looking title is never sufficient proof. */
export function NrDocumentContentReader({
  row,
  norma,
  value,
}: {
  row: NrRecord;
  norma: Norma;
  value: NativeContent;
}) {
  const fetch = useServerFn(nrRevisaoDetalhe);
  const converted =
    !!row.dados["conversao"] || row.tipo === "derivado_docx" || !!row.dados["arquivo_original_id"];
  const candidate = !converted && !!row.revisao_atual_id && hasLegacySnapshotSignature(value);
  const revision = useQuery({
    queryKey: [
      "nr",
      row.organization_id,
      norma,
      "leitura-snapshot-revisao",
      row.id,
      row.revisao_atual_id,
      row.version,
    ],
    enabled: (candidate || converted) && !!row.revisao_atual_id,
    queryFn: ({ signal }) =>
      fetch({
        data: {
          organization_id: row.organization_id,
          norma,
          recurso: "documentos",
          registro_id: row.id,
          revisao_id: row.revisao_atual_id!,
        },
        signal,
      }),
    retry: false,
  });
  const data = nrObject(revision.data && (revision.data["revisao"] ?? revision.data));
  const projection =
    candidate && revision.data
      ? proveLegacySnapshotContent({
          content: value,
          revisionContent: data["conteudo"],
          snapshot: data["snapshot"],
          expectedRevisionId: row.revisao_atual_id!,
          actualRevisionId: data["id"],
          converted,
        })
      : null;
  if ((candidate || converted) && revision.isPending)
    return <LoadingState label="Organizando o snapshot preservado desta revisão…" />;
  if ((candidate || converted) && revision.isError)
    return (
      <>
        <p className="nr-feedback" role="alert">
          Não foi possível carregar os dados preservados desta revisão para organizar a leitura. O
          conteúdo já carregado continua disponível abaixo.
          <ActionButton variant="ghost" onClick={() => void revision.refetch()}>
            Tentar novamente
          </ActionButton>
        </p>
        <NrContentEditor org={row.organization_id} value={value} readOnly />
      </>
    );
  if (converted && revision.data)
    return <NrConvertedDocxContent row={row} norma={norma} value={value} revision={data} />;
  return projection ? (
    <LegacySnapshotView
      snapshot={projection.snapshot}
      org={row.organization_id}
      context={row.titulo}
    />
  ) : (
    <NrContentEditor org={row.organization_id} value={value} readOnly />
  );
}
