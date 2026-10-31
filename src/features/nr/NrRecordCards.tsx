import { Link } from "@tanstack/react-router";
import {
  AlertCircle,
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  FileText,
  Folder,
  Image,
  Paperclip,
} from "lucide-react";
import type { NrRecurso, NrRecord } from "./domain";
import type { NrSearch, NrSection } from "./NrWorkspace";
import { NrCard, NrCardActions, NrCardMeta } from "./NrCards";
import { useCollectionReturn } from "./useCollectionReturn";
import { NrValue, nrDate, nrLabel, nrObject } from "./technical-display";

const categories: Record<string, string> = {
  levantamento: "Roteiro de levantamento",
  regra: "Regra",
  criterio: "Critério",
  familia: "Família de soluções",
  documento: "Modelo documental",
};
const date = (value?: string | null) => (value ? nrDate(value) : "Não informado");
function Status({ row }: { row: NrRecord }) {
  return (
    <span className="nr-badge">
      {nrLabel(row.arquivado_em ? "arquivado" : row.estado_origem || row.estado)}
    </span>
  );
}

/** Each list uses the same DTO, order and pagination as before; no per-card query. */
export function RecordList({
  rows,
  resource,
  base,
  search,
  section,
}: {
  rows: NrRecord[];
  resource: NrRecurso;
  base: string;
  search: NrSearch;
  section?: NrSection;
}) {
  const returnTo = useCollectionReturn(
    `${rows[0]?.organization_id || ""}:${base}:${resource}`,
    JSON.stringify([
      search.cliente,
      search.unidade,
      search.busca,
      search.estado,
      search.pagina,
      search.pasta,
      search.tipo,
      search.familia,
      search.grupo,
      search.lixeira,
      search.local,
      search.copias,
      search.aplicabilidade,
    ]),
  );
  return (
    <ul
      {...returnTo}
      className="nr-card-grid"
      aria-label={
        resource === "locais"
          ? "Inventário técnico da unidade"
          : resource === "documentos"
            ? "Documentos e representações vinculadas"
            : undefined
      }
    >
      {rows.map((row) => {
        const technical = row.resumo_tecnico;
        const summary = row.resumo_documental;
        const localFamily = nrObject(row.local_contexto)["familia"];
        const family =
          row.familia ||
          (resource === "levantamentos" && typeof localFamily === "string"
            ? localFamily
            : undefined);
        const normBase =
          resource === "pendencias" &&
          row.normas?.length &&
          !row.normas.includes(base === "/nr-33" ? "NR33" : "NR35")
            ? row.normas.includes("NR33")
              ? "/nr-33"
              : "/nr-35"
            : base;
        const link = `${normBase}/${section === "configuracoes" || resource === "modelos" ? "biblioteca" : resource}/${row.id}`;
        const kind =
          resource === "locais"
            ? "local"
            : resource === "documentos"
              ? "documento"
              : resource === "pendencias"
                ? "pendencia"
                : resource === "levantamentos"
                  ? "levantamento"
                  : resource === "modelos"
                    ? "biblioteca"
                    : "generic";
        const Icon =
          resource === "documentos"
            ? FileText
            : resource === "modelos"
              ? BookOpen
              : resource === "pastas"
                ? Folder
                : ClipboardList;
        const context = row.local_tag
          ? `${row.local_tag} · ${row.local_titulo || ""}`
          : row.local_titulo || row.unidade_nome;
        return (
          <li key={row.id}>
            <NrCard kind={kind} data-record-id={row.id}>
              <header className="nr-card-heading">
                <div className="nr-card-identity">
                  {resource === "locais" ? (
                    <span className="nr-card-tag">{row.tag || "Sem TAG"}</span>
                  ) : (
                    <span className="nr-card-category">
                      <Icon size={16} aria-hidden />
                      {resource === "modelos"
                        ? categories[row.tipo || ""] || nrLabel(row.tipo || "Modelo")
                        : resource === "documentos"
                          ? row.tipo === "derivado_docx"
                            ? "Cópia editável de Word"
                            : nrLabel(row.tipo || "Documento")
                          : resource === "levantamentos"
                            ? "Levantamento"
                            : resource === "pendencias"
                              ? "Pendência"
                              : nrLabel(row.tipo || resource)}
                    </span>
                  )}
                  <h3>
                    <Link to={link} search={search}>
                      {row.tag && resource !== "locais" ? `${row.tag} · ` : ""}
                      {row.titulo}
                    </Link>
                  </h3>
                  {resource === "locais" ? (
                    <p className="nr-card-context">{technical?.setor || "Setor não informado"}</p>
                  ) : (
                    <p className="nr-card-context">
                      {context ||
                        (resource === "documentos"
                          ? "Geral da unidade"
                          : row.tipo && resource !== "modelos"
                            ? nrLabel(row.tipo)
                            : null)}
                    </p>
                  )}
                </div>
                {resource === "documentos" ? (
                  <span className="nr-card-revision">
                    <small>Revisão</small>
                    <strong>{summary?.revisao_numero ?? row.revisao_numero ?? "—"}</strong>
                  </span>
                ) : (
                  <Status row={row} />
                )}
              </header>

              {resource === "locais" ? (
                <NrCardMeta>
                  <div>
                    <dt>Família</dt>
                    <dd>{row.familia || "Não informada"}</dd>
                  </div>
                  <div>
                    <dt>Enquadramento</dt>
                    <dd>
                      <NrValue value={technical?.enquadramento} />
                    </dd>
                  </div>
                  <div>
                    <dt>Avaliações registradas</dt>
                    <dd>{technical?.avaliacoes_total ?? "—"}</dd>
                  </div>
                  <div>
                    <dt>Levantamento</dt>
                    <dd>
                      <NrValue value={technical?.situacao_levantamento} />
                    </dd>
                  </div>
                  <div className="nr-wide">
                    <dt>Memorial na origem</dt>
                    <dd>
                      <NrValue value={technical?.memorial} />
                    </dd>
                  </div>
                </NrCardMeta>
              ) : resource === "documentos" ? (
                <>
                  <div className="nr-card-state">
                    <Status row={row} />
                    <span>
                      {nrLabel(summary?.vigencia_apresentacao || "Vigência não informada")}
                    </span>
                  </div>
                  <NrCardMeta>
                    <div>
                      <dt>Data de origem</dt>
                      <dd>{date(summary?.data_origem_texto || summary?.data_origem)}</dd>
                    </div>
                    <div>
                      <dt>Representações</dt>
                      <dd>
                        {summary ? (
                          <>
                            <span>{summary.arquivos_word} Word</span>
                            <span className="nr-meta-separator">{summary.arquivos_pdf} PDF</span>
                          </>
                        ) : (
                          "Consultar acervo"
                        )}
                      </dd>
                    </div>
                  </NrCardMeta>
                  {!!summary?.copias_editaveis?.length && (
                    <p className="nr-card-evidence">
                      <Paperclip size={15} aria-hidden />
                      {summary.copias_editaveis.length} cópia(s) editável(is) na ficha
                    </p>
                  )}
                  {summary?.correspondencia_pendente && (
                    <p className="nr-card-attention">
                      <AlertCircle size={16} aria-hidden />
                      Cópia editável · correspondência documental pendente
                    </p>
                  )}
                  {summary?.disponibilidade === "sem_arquivo_confirmado" && (
                    <p className="nr-card-evidence">Sem arquivo confirmado nesta revisão</p>
                  )}
                  {summary?.motivo_substituicao && (
                    <details className="nr-card-complement">
                      <summary>Motivo da substituição</summary>
                      <p className="nr-prewrap">{summary.motivo_substituicao}</p>
                    </details>
                  )}
                </>
              ) : resource === "pendencias" ? (
                <>
                  <p
                    className="nr-card-criticality"
                    data-level={row.criticidade || "nao_informada"}
                  >
                    <AlertCircle size={16} aria-hidden />
                    Criticidade{" "}
                    {row.criticidade
                      ? nrLabel(row.criticidade).toLocaleLowerCase("pt-BR")
                      : "não informada"}
                  </p>
                  <NrCardMeta>
                    <div className="nr-wide">
                      <dt>Normas registradas</dt>
                      <dd>
                        {row.normas
                          ?.map((norm) => (norm === "NR33" ? "NR-33" : "NR-35"))
                          .join(" · ") || "Não informadas no resumo"}
                      </dd>
                    </div>
                    {row.prazo && (
                      <div>
                        <dt>Prazo</dt>
                        <dd>{date(row.prazo)}</dd>
                      </div>
                    )}
                    {row.revisao_numero != null && (
                      <div>
                        <dt>Revisão</dt>
                        <dd>{row.revisao_numero}</dd>
                      </div>
                    )}
                  </NrCardMeta>
                  {base === "/nr-35" && row.normas?.length && !row.normas.includes("NR35") && (
                    <p className="nr-card-attention">Aplicabilidade em revisão · abrir na NR-33</p>
                  )}
                </>
              ) : (
                <NrCardMeta>
                  {family && (
                    <div>
                      <dt>Família</dt>
                      <dd>{family}</dd>
                    </div>
                  )}
                  {row.revisao_numero != null && (
                    <div>
                      <dt>Revisão</dt>
                      <dd>{row.revisao_numero}</dd>
                    </div>
                  )}
                  {typeof row.dados?.["codigo"] === "string" && (
                    <div>
                      <dt>Código</dt>
                      <dd>{row.dados["codigo"]}</dd>
                    </div>
                  )}
                  {row.dados?.["versao"] != null && (
                    <div>
                      <dt>Versão do conteúdo</dt>
                      <dd>
                        <NrValue value={row.dados["versao"]} />
                      </dd>
                    </div>
                  )}
                  {typeof row.dados?.["origem"] === "string" && (
                    <div className="nr-wide">
                      <dt>Origem</dt>
                      <dd>{row.dados["origem"]}</dd>
                    </div>
                  )}
                  {row.resumo_pasta && (
                    <>
                      <div>
                        <dt>Conteúdo</dt>
                        <dd>
                          {row.resumo_pasta.documentos} documentos · {row.resumo_pasta.imagens}{" "}
                          imagens
                        </dd>
                      </div>
                      <div>
                        <dt>Organização</dt>
                        <dd>
                          {row.resumo_pasta.subpastas} subpastas · {row.resumo_pasta.arquivos}{" "}
                          arquivos
                        </dd>
                      </div>
                    </>
                  )}
                  <div>
                    <dt>Atualização na Nexus</dt>
                    <dd>{date(row.updated_at)}</dd>
                  </div>
                </NrCardMeta>
              )}
              {row.revisao_necessaria && (
                <p className="nr-card-attention">
                  <AlertCircle size={16} aria-hidden />
                  Revisão necessária
                </p>
              )}
              <NrCardActions>
                <Link className="nr-card-open" to={link} search={search}>
                  {resource === "locais"
                    ? "Abrir ficha"
                    : resource === "documentos"
                      ? "Abrir documento"
                      : resource === "levantamentos"
                        ? "Abrir levantamento"
                        : resource === "pendencias"
                          ? "Consultar tratativa"
                          : resource === "pastas"
                            ? "Abrir pasta"
                            : "Consultar registro"}
                  <ArrowUpRight size={16} aria-hidden />
                </Link>
                {resource === "locais" && (
                  <div className="nr-card-evidence-actions">
                    <Link to={link} search={{ ...search, ficha: "fotos" }}>
                      <Image size={15} aria-hidden />
                      {technical?.imagens_total ?? "—"} fotos
                    </Link>
                    <Link to={link} search={{ ...search, ficha: "documentos" }}>
                      <FileText size={15} aria-hidden />
                      {technical?.documentos_total ?? "—"} documentos
                    </Link>
                  </div>
                )}
              </NrCardActions>
            </NrCard>
          </li>
        );
      })}
    </ul>
  );
}
