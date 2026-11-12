import { InspecoesProtocolo } from "./InspecoesProtocolo";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  ArrowRight,
  ChevronRight,
  FileText,
  History,
  Layers3,
  Paperclip,
} from "lucide-react";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { inspecoesDetalhe } from "./inspecoes.functions";
import {
  Badge,
  Fatos,
  ValorEstruturado,
  contextoRegistro,
  dataCivil,
  legenda,
  objeto,
  recursosLabels,
  texto,
} from "./apresentacao";
import type { InspecoesFicha } from "./route-state";
import type {
  InspecoesAtribuicao,
  InspecoesDetalhe,
  InspecoesEscopo,
  InspecoesRegistro,
  InspecoesUnidade,
} from "./ui-contract";
import { InspecoesArquivos } from "./InspecoesArquivos";
import { InspecoesPlanta, type InspecoesMapaView } from "./InspecoesPlanta";
import { InspecoesLevantamentoPanel } from "./InspecoesLevantamentos";

type DetailProps = {
  escopo: InspecoesEscopo;
  queryKey: readonly string[];
  unidades: InspecoesUnidade[];
  userId: string;
  atribuicao?: InspecoesAtribuicao | undefined;
};

export function InspecoesDetalheDialog({
  trail,
  opener,
  fallbackFocus,
  setTrail,
  ...props
}: DetailProps & {
  trail: InspecoesFicha[];
  opener: RefObject<HTMLElement | null>;
  fallbackFocus: RefObject<HTMLHeadingElement | null>;
  setTrail: (trail: InspecoesFicha[]) => void;
}) {
  const active = trail.at(-1);
  const scroll = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const locations = useRef(new Map<string, number>());
  const views = useRef(new Map<string, InspecoesMapaView>());
  const sections = useRef(new Map<string, Section>());
  const load = useServerFn(inspecoesDetalhe);
  const query = useQuery<InspecoesDetalhe>({
    queryKey: [...props.queryKey, "detalhe", active?.recurso, active?.id],
    enabled: !!active,
    retry: false,
    queryFn: ({ signal }) => {
      if (!active) throw new Error("Nenhum registro foi selecionado.");
      return load({ data: { ...props.escopo, ...active }, signal });
    },
  });
  const viewKey = active ? `${trail.length}:${active.id}` : "";
  const loadedId = query.data?.registro.id;
  useEffect(() => {
    if (!viewKey) {
      locations.current.clear();
      views.current.clear();
      sections.current.clear();
      return;
    }
    if (loadedId) {
      title.current?.focus({ preventScroll: true });
      const panel = scroll.current;
      if (panel) panel.scrollTop = locations.current.get(viewKey) ?? 0;
    }
  }, [viewKey, loadedId]);

  function openRelated(item: InspecoesRegistro) {
    if (active?.id === item.id && active.recurso === item.colecao) return;
    if (viewKey) locations.current.set(viewKey, scroll.current?.scrollTop ?? 0);
    const next = [...trail, { id: item.id, recurso: item.colecao }];
    setTrail(next.slice(-12));
  }

  return (
    <Dialog
      open={!!active}
      onOpenChange={(open) => {
        if (!open) setTrail([]);
      }}
    >
      <DialogContent
        className="nx-nr-workspace insp-dialog"
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          title.current?.focus({ preventScroll: true });
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          const target = opener.current?.isConnected ? opener.current : fallbackFocus.current;
          target?.focus({ preventScroll: true });
          opener.current = null;
        }}
      >
        <DialogHeader className="insp-dialog-header">
          <div className="insp-breadcrumb">
            <button
              type="button"
              onClick={() => setTrail(trail.slice(0, -1))}
              className="insp-text-link"
            >
              <ArrowLeft size={16} aria-hidden="true" />{" "}
              {trail.length > 1 ? "Voltar à ficha anterior" : "Voltar à consulta"}
            </button>
            {trail.length > 1 && (
              <>
                <ChevronRight size={15} aria-hidden="true" />
                <span>{trail.map(({ recurso }) => recursosLabels[recurso]).join(" / ")}</span>
              </>
            )}
          </div>
          <DialogTitle ref={title} tabIndex={-1}>
            {query.data?.registro.titulo ??
              (active && recursosLabels[active.recurso]) ??
              "Ficha de Inspeções"}
          </DialogTitle>
          <DialogDescription>
            {query.data
              ? contextoRegistro(query.data.registro, props.unidades) ||
                recursosLabels[query.data.registro.colecao]
              : "Dados do registro e vínculos do acervo"}
          </DialogDescription>
        </DialogHeader>
        <div className="insp-dialog-scroll" ref={scroll}>
          {query.isPending ? (
            <LoadingState label="Carregando ficha…" />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => void query.refetch()} />
          ) : (
            <Conteudo
              key={viewKey}
              views={views.current}
              viewKey={viewKey}
              initialSection={sections.current.get(viewKey) ?? "resumo"}
              saveSection={(section) => sections.current.set(viewKey, section)}
              detalhe={query.data}
              abrir={openRelated}
              {...props}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

const sections = [
  { id: "resumo", label: "Resumo", icon: FileText },
  { id: "vinculos", label: "Vínculos", icon: Layers3 },
  { id: "arquivos", label: "Arquivos e fotos", icon: Paperclip },
  { id: "historico", label: "Histórico e origem", icon: History },
] as const;

type Section = (typeof sections)[number]["id"];

function Conteudo({
  detalhe,
  abrir,
  views,
  viewKey,
  initialSection,
  saveSection,
  ...props
}: DetailProps & {
  detalhe: InspecoesDetalhe;
  abrir: (item: InspecoesRegistro) => void;
  views: Map<string, InspecoesMapaView>;
  viewKey: string;
  initialSection: Section;
  saveSection: (section: Section) => void;
}) {
  const [section, setCurrentSection] = useState(initialSection);
  function setSection(next: Section) {
    setCurrentSection(next);
    saveSection(next);
  }
  const item = detalhe.registro;
  const source = item.snapshot;
  const isAsset = item.colecao === "ativos";
  const isDocument = item.colecao === "documentos";
  const original = detalhe.arquivos.find(
    (file) => file.papel === "original" && file.mime === "application/pdf",
  );
  const originalStatus = original?.estado ?? texto(source["original_situacao"]);
  const extracted = source["conteudo_extraido"] ?? source["texto_extraido"] ?? source["snapshot"];
  const status = item.situacao;
  const r64 = objeto(source["r64"]);
  const r64status = texto(item.resumo?.["r64_status"] ?? source["r64_status"] ?? r64["status"]);
  const result = texto(source["resultado"]);
  const excluded = new Set([
    "pontos",
    "geometria",
    "fundo",
    "historico",
    "importacao",
    "snapshot",
    "texto_extraido",
    "conteudo_extraido",
    "id",
    "modulo",
    "cliente_id",
    "unidade_id",
    "documento_id",
    "documento_ids",
    "ativo_ids",
    "ativo_id",
    "chave_importacao",
  ]);
  const body = Object.fromEntries(Object.entries(source).filter(([key]) => !excluded.has(key)));
  const phases = detalhe.relacionados
    .filter(
      ({ colecao }) => colecao === "ativos" || colecao === "plantas" || colecao === "documentos",
    )
    .sort((a, b) => Number(b.colecao === "plantas") - Number(a.colecao === "plantas"));
  const canShowWork = isAsset && item.vigente && item.existente;
  return (
    <div className="insp-stack">
      <nav className="insp-subnav insp-detail-tabs" aria-label="Seções da ficha">
        {sections.map(({ id, label, icon: Icon }) => (
          <button
            type="button"
            key={id}
            aria-pressed={id === section}
            onClick={() => setSection(id)}
          >
            <Icon size={16} aria-hidden="true" />
            {label}
          </button>
        ))}
      </nav>

      {section === "resumo" && (
        <>
          <div className="insp-badges">
            {status && <Badge value={status} />}
            {r64status && <Badge value={r64status} kind="prazo" />}
            {result && <Badge value={result} kind="tecnico" />}
          </div>
          <Fatos
            items={[
              [isAsset ? "TAG" : "Código", item.codigo],
              ["Família", item.familia],
              ["Revisão", texto(source["revisao"])],
              ["Local registrado", texto(source["local"])],
              ["Setor registrado", texto(source["setor"])],
              ["Tipo de inspeção", texto(source["tipo_inspecao"])],
              [
                "Vencimento R64",
                dataCivil(item.resumo?.["vence"] ?? r64["vence"] ?? source["vence"]),
              ],
              ["Data de referência", dataCivil(item.data_ref)],
              [
                "Resultado histórico no laudo",
                texto(source["resultado_relatorio"]) &&
                  legenda(texto(source["resultado_relatorio"])),
              ],
              [
                "Parecer técnico na origem",
                texto(source["resultado_rt"]) && legenda(texto(source["resultado_rt"])),
              ],
              ["Original PDF", isDocument && originalStatus ? legenda(originalStatus) : ""],
            ]}
          />
          {typeof source["resumo"] === "string" && source["resumo"].trim() && (
            <p className="insp-preserve-lines">{source["resumo"]}</p>
          )}
          {typeof source["descricao"] === "string" && source["descricao"].trim() && (
            <p className="insp-preserve-lines">{source["descricao"]}</p>
          )}
          {item.colecao === "matrizes" && <MatrizTecnica source={source} />}
          {item.colecao === "plantas" && (
            <InspecoesPlanta detalhe={detalhe} abrir={abrir} views={views} viewKey={viewKey} />
          )}
          {item.colecao === "familias" &&
            item.codigo &&
            props.atribuicao?.perfil === "EST" &&
            props.atribuicao.biblioteca &&
            !props.atribuicao.cliente_id && (
              <InspecoesProtocolo
                organizationId={props.escopo.organizationId}
                familia={item.codigo}
                queryKey={props.queryKey}
              />
            )}
          {canShowWork && (
            <InspecoesLevantamentoPanel
              ativo={item}
              escopo={props.escopo}
              queryKey={props.queryKey}
              atribuicao={props.atribuicao}
              userId={props.userId}
            />
          )}
          {phases.length > 0 && (
            <Relacionados
              items={phases}
              unidades={props.unidades}
              abrir={abrir}
              preview={() => setSection("vinculos")}
            />
          )}
          {isDocument && extracted != null && extracted !== "" && (
            <DadosExpansiveis label="Conteúdo extraído do documento" value={extracted} />
          )}
          <DadosExpansiveis
            label={
              item.colecao === "familias"
                ? "Ficha técnica e checklist"
                : "Dados completos do registro"
            }
            value={body}
          />
        </>
      )}

      {section === "vinculos" && (
        <Relacionados items={detalhe.relacionados} unidades={props.unidades} abrir={abrir} />
      )}
      {section === "arquivos" && (
        <InspecoesArquivos
          files={detalhe.arquivos}
          escopo={props.escopo}
          queryKey={props.queryKey}
          context={contextoRegistro(item, props.unidades) ?? item.titulo}
          title={item.titulo}
          isDocument={isDocument}
        />
      )}
      {section === "historico" && (
        <div className="insp-stack">
          <h3 className="insp-subheading">Histórico na origem</h3>
          {Array.isArray(source["historico"]) && source["historico"].length > 0 ? (
            <ValorEstruturado value={source["historico"]} />
          ) : (
            <EmptyState title="Nenhum evento histórico registrado" />
          )}
          <h3 className="insp-subheading">Proveniência da migração</h3>
          <Fatos
            items={[
              ["Identificador na origem", item.source_id],
              ["Autor na origem", item.origem_autor],
              ["Data na origem", dataCivil(item.origem_data)],
              ["Importado em", dataCivil(item.importado_em)],
            ]}
          />
          {source["importacao"] != null && (
            <DadosExpansiveis label="Metadados de importação" value={source["importacao"]} />
          )}
        </div>
      )}
    </div>
  );
}

function DadosExpansiveis({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  return (
    <details className="insp-expand" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{label}</summary>
      {open && (
        <div>
          <ValorEstruturado value={value} />
        </div>
      )}
    </details>
  );
}

function Relacionados({
  items,
  unidades,
  abrir,
  preview,
}: {
  items: InspecoesRegistro[];
  unidades: InspecoesUnidade[];
  abrir: (item: InspecoesRegistro) => void;
  preview?: () => void;
}) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(24);
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  const visible = items.filter(
    (item) =>
      !normalized ||
      [item.titulo, item.codigo, recursosLabels[item.colecao]].some((value) =>
        value?.toLocaleLowerCase("pt-BR").includes(normalized),
      ),
  );
  if (!items.length) return <EmptyState title="Nenhum registro vinculado" />;
  return (
    <section className="insp-stack">
      <h3 className="insp-subheading">Registros relacionados</h3>
      {!preview && items.length > 8 && (
        <label className="insp-field insp-relation-search">
          Buscar nos vínculos
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(24);
            }}
            placeholder="Nome, código ou TAG"
          />
        </label>
      )}
      {visible.length ? (
        <ul className="insp-related-list">
          {visible.slice(0, preview ? 8 : limit).map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => abrir(item)}>
                <span>
                  <small>
                    {recursosLabels[item.colecao]}
                    {item.codigo ? ` · ${item.codigo}` : ""}
                  </small>
                  <strong>{item.titulo}</strong>
                  <small>{contextoRegistro(item, unidades)}</small>
                </span>
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState title="Nenhum vínculo encontrado" />
      )}
      {preview && items.length > 8 && (
        <ActionButton variant="ghost" onClick={preview}>
          Ver todos os vínculos ({items.length})
        </ActionButton>
      )}
      {!preview && visible.length > limit && (
        <ActionButton variant="ghost" onClick={() => setLimit(limit + 24)}>
          Mostrar mais vínculos
        </ActionButton>
      )}
    </section>
  );
}

function MatrizTecnica({ source }: { source: Record<string, unknown> }) {
  const rows = Array.isArray(source["linhas"]) ? source["linhas"].map(objeto) : [];
  const segments = ["CC", "AG-A", "AG-B", "IN"];
  if (!rows.length) return null;
  return (
    <section className="insp-stack" aria-label="Matriz família por segmento">
      <p>{texto(source["legenda"])}</p>
      <div
        className="insp-matrix-frame"
        tabIndex={0}
        role="region"
        aria-label="Tabela de segmentos"
      >
        <table className="insp-matrix">
          <thead>
            <tr>
              <th scope="col">Família ou serviço</th>
              {segments.map((segment) => (
                <th scope="col" key={segment}>
                  {segment}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={texto(row["linha"])}>
                <th scope="row">{texto(row["linha"])}</th>
                {segments.map((segment) => {
                  const symbol = texto(row[segment]);
                  const label =
                    symbol === "●"
                      ? "Trabalho registrado"
                      : symbol === "○"
                        ? "Pode ser ofertado"
                        : symbol === "–"
                          ? "Não se aplica"
                          : symbol || "Indefinido";
                  return (
                    <td key={segment}>
                      <span title={label} aria-label={label}>
                        {symbol || "—"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {texto(source["nota"]) && <p className="nr-muted">{texto(source["nota"])}</p>}
    </section>
  );
}
