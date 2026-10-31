import { useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, ChevronDown, Link2, Pencil, Plus, X } from "lucide-react";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import { CadastroEditor } from "@/features/clientes/CadastroEditor";
import { obterCadastro } from "@/features/clientes/clientes.functions";
import { cadastroNome, useCadastroList, useDebouncedSearch } from "@/features/clientes/queries";
import { type Cadastro, type CadastroGrupo } from "@/features/clientes/schemas";
import { papelAutoriza } from "@/features/auth/autorizacao";
import { useOrg } from "@/features/org/session";
import { nrAssociarContexto } from "./nr.functions";
import type { Norma, NrContexto } from "./domain";
import type { NrSearch } from "./NrWorkspace";
import { NrStructuredValue } from "./NrStructuredValue";
import { nrLabel } from "./technical-display";
import { NrClientBrand } from "./NrClientBrand";
import { useCollectionReturn } from "./useCollectionReturn";
import "@/features/clientes/clientes.css";

type EditorState = {
  grupo: CadastroGrupo;
  row: Cadastro | null;
  cliente: string | null;
  associateAfterSave: boolean;
};
const compare = new Intl.Collator("pt-BR", { numeric: true, sensitivity: "base" });
export function NrClientsWorkspace({
  org,
  norma,
  contexto,
  search,
  onSearch,
}: {
  org: string;
  norma: Norma;
  contexto: NrContexto;
  search: NrSearch;
  onSearch: (patch: Partial<NrSearch>) => void;
}) {
  const session = useOrg();
  const canEditCadastro = !!session.data && papelAutoriza(session.data.roles, "editar_cadastro");
  const canAssociate = contexto.permissoes.cadastrar;
  const get = useServerFn(obterCadastro),
    associate = useServerFn(nrAssociarContexto);
  const qc = useQueryClient();
  const keys = useRef(new Map<string, string>());
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [associationOpen, setAssociationOpen] = useState(false);
  const collapsedKey = `nexus.nr.clients-collapsed.v1:${session.data?.userId || ""}:${org}:${norma}`;
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(collapsedKey) || "null") as {
        ids: unknown;
        captured: number;
      } | null;
      if (saved && Array.isArray(saved.ids) && Date.now() - saved.captured < 30 * 60_000)
        return new Set(saved.ids.filter((value): value is string => typeof value === "string"));
    } catch {
      /* Selection works without browser storage. */
    }
    return new Set();
  });
  const returnTo = useCollectionReturn<HTMLElement>(
    `${org}:${norma}:clientes`,
    JSON.stringify([search.cliente, search.unidade, search.busca, search.pagina]),
  );
  const toggleClient = (clientId: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      try {
        sessionStorage.setItem(
          collapsedKey,
          JSON.stringify({ ids: [...next], captured: Date.now() }),
        );
      } catch {
        /* Optional state persistence. */
      }
      return next;
    });
  const [candidate, setCandidate] = useState<{ id: string; nome: string } | null>(null);
  const [globalSearch, setGlobalSearch] = useState("");
  const [clientPage, setClientPage] = useState(0),
    [unitPage, setUnitPage] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null),
    [notice, setNotice] = useState("");
  const clients = useCadastroList(
    org,
    "clientes",
    null,
    useDebouncedSearch(globalSearch),
    "ativos",
    clientPage,
    10,
    associationOpen && canAssociate,
  );
  const units = useCadastroList(
    org,
    "unidades",
    candidate?.id ?? null,
    "",
    "ativos",
    unitPage,
    10,
    associationOpen && canAssociate && !!candidate,
  );
  const base = norma === "NR33" ? "/nr-33" : "/nr-35";
  const contextSearch = (client: string, unit: string) => ({
    ...search,
    cliente: client,
    unidade: unit,
    local: "",
    busca: "",
    pagina: 0,
    pasta: "",
    estado: "",
    vinculo: "" as const,
    escopo: "unidade" as const,
  });
  async function edit(grupo: CadastroGrupo, id: string, client: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const row = await get({ data: { organization_id: org, entidade: grupo, id } });
      setEditor({ grupo, row, cliente: client || null, associateAfterSave: false });
    } catch (cause) {
      setError(cause instanceof Error ? cause : new Error("Cadastro indisponível para edição."));
    } finally {
      setBusy(false);
    }
  }
  async function bind(client: string, unit: string) {
    const identity = `${org}/${client}/${unit}/${norma}`;
    const chave = keys.current.get(identity) ?? crypto.randomUUID();
    keys.current.set(identity, chave);
    await associate({
      data: { organization_id: org, cliente_id: client, unidade_id: unit, normas: [norma], chave },
    });
    await qc.invalidateQueries({ queryKey: ["nr", org] });
    setNotice("Unidade associada ao módulo. O cadastro global foi preservado.");
    onSearch(contextSearch(client, unit));
  }
  async function associateExisting(unit: string) {
    if (!candidate || busy) return;
    setBusy(true);
    setError(null);
    try {
      await bind(candidate.id, unit);
      setAssociationOpen(false);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause
          : new Error("Não foi possível associar a unidade. O cadastro continua preservado."),
      );
    } finally {
      setBusy(false);
    }
  }
  async function saved(row: Cadastro) {
    const operation = editor;
    setEditor(null);
    setNotice("Cadastro salvo.");
    if (operation?.grupo === "clientes" && !operation.row) {
      setAssociationOpen(true);
      setCandidate({ id: row.id, nome: cadastroNome(row) });
      setUnitPage(0);
      setNotice(
        "Cliente cadastrado. Cadastre ou selecione uma unidade para associá-lo a este módulo.",
      );
      return;
    }
    if (operation?.grupo === "unidades" && operation.associateAfterSave && "cliente_id" in row) {
      setBusy(true);
      setError(null);
      try {
        await bind(row.cliente_id, row.id);
      } catch (cause) {
        setAssociationOpen(true);
        setCandidate({
          id: row.cliente_id,
          nome:
            contexto.clientes.find((client) => client.id === row.cliente_id)?.nome ||
            candidate?.nome ||
            "Cliente cadastrado",
        });
        setError(
          cause instanceof Error
            ? cause
            : new Error("Unidade salva. Falta confirmar sua associação ao módulo."),
        );
      } finally {
        setBusy(false);
      }
    }
    await qc.invalidateQueries({ queryKey: ["nr", org] });
  }
  return (
    <section {...returnTo} aria-label="Clientes e unidades do acervo NR" className="space-y-4">
      <div className="nr-panel-header">
        <div>
          <h2 className="font-semibold">Clientes e unidades</h2>
          <p className="nr-muted">
            Cadastros associados ao trabalho NR. Unidades sem locais continuam acessíveis pelo
            acervo e pelas pendências. Quantidades no recorte {norma === "NR33" ? "NR-33" : "NR-35"}
            .
          </p>
        </div>
        <div className="nr-actions">
          {canAssociate && (
            <ActionButton variant="ghost" onClick={() => setAssociationOpen(!associationOpen)}>
              <Link2 size={16} />
              Associar cadastro existente
            </ActionButton>
          )}
          {canEditCadastro && canAssociate && (
            <ActionButton
              onClick={() =>
                setEditor({
                  grupo: "clientes",
                  row: null,
                  cliente: null,
                  associateAfterSave: false,
                })
              }
            >
              <Plus size={16} />
              Novo cliente
            </ActionButton>
          )}
        </div>
      </div>
      {notice && (
        <p className="nr-notice" role="status">
          {notice}
        </p>
      )}
      {error && <ErrorState error={error} />}
      {associationOpen && canAssociate && (
        <section className="nr-panel" aria-label="Associar cliente e unidade existentes">
          <div className="nr-panel-header">
            <h3 className="font-semibold">Associar cadastro existente</h3>
            <ActionButton variant="ghost" onClick={() => setAssociationOpen(false)}>
              <X size={16} />
              Fechar
            </ActionButton>
          </div>
          <p className="nr-muted mb-3">
            Busque no cadastro global e escolha a unidade. Esta ação cria uma associação explícita
            ao módulo, sem arquivar ou excluir outros clientes.
          </p>
          <label>
            Buscar cliente no cadastro global
            <input
              type="search"
              maxLength={120}
              value={globalSearch}
              onChange={(event) => {
                setGlobalSearch(event.target.value);
                setClientPage(0);
              }}
              placeholder="Nome, razão social ou identificação fiscal"
            />
          </label>
          {clients.isPending ? (
            <LoadingState label="Consultando cadastros…" />
          ) : clients.isError ? (
            <ErrorState error={clients.error} onRetry={() => clients.refetch()} />
          ) : (
            <>
              <ul className="nr-card-grid my-3">
                {clients.data?.rows.map((client) => (
                  <li
                    key={client.id}
                    className="nr-card"
                    data-selected={candidate?.id === client.id}
                  >
                    <button
                      type="button"
                      className="nr-client-identity-button w-full"
                      aria-pressed={candidate?.id === client.id}
                      onClick={() => {
                        setCandidate({
                          id: client.id,
                          nome: client.nome_exibicao || client.razao_social,
                        });
                        setUnitPage(0);
                      }}
                    >
                      <NrClientBrand
                        client={{ ...client, nome: client.nome_exibicao || client.razao_social }}
                      />
                    </button>
                    <p className="nr-muted">
                      {client.cnpj || "Identificação não informada"}
                      {candidate?.id === client.id && " · selecionado"}
                    </p>
                  </li>
                ))}
              </ul>
              {!clients.data?.rows.length && (
                <p className="nr-muted my-3">Nenhum cadastro encontrado.</p>
              )}
              <div className="nr-actions">
                <ActionButton
                  variant="ghost"
                  disabled={clientPage === 0}
                  onClick={() => setClientPage(clientPage - 1)}
                >
                  Clientes anteriores
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={(clientPage + 1) * 10 >= (clients.data?.total ?? 0)}
                  onClick={() => setClientPage(clientPage + 1)}
                >
                  Mais clientes
                </ActionButton>
              </div>
            </>
          )}
          {candidate && (
            <div className="border-t border-border mt-4 pt-4">
              <div className="nr-panel-header">
                <h4 className="font-medium">Unidades de {candidate.nome}</h4>
                {canEditCadastro && (
                  <ActionButton
                    variant="ghost"
                    onClick={() =>
                      setEditor({
                        grupo: "unidades",
                        row: null,
                        cliente: candidate.id,
                        associateAfterSave: true,
                      })
                    }
                  >
                    <Plus size={16} />
                    Nova unidade
                  </ActionButton>
                )}
              </div>
              {units.isPending ? (
                <LoadingState label="Consultando unidades…" />
              ) : units.isError ? (
                <ErrorState error={units.error} onRetry={() => units.refetch()} />
              ) : (
                <>
                  <ul className="nr-card-grid">
                    {units.data?.rows.map((unit) => (
                      <li key={unit.id} className="nr-card">
                        <header className="nr-card-heading">
                          <h5 className="nr-card-title">{unit.nome}</h5>
                        </header>
                        <div className="nr-card-body">
                          <p className="nr-muted">{unit.endereco || "Endereço não informado"}</p>
                        </div>
                        <footer className="nr-card-actions">
                          <ActionButton
                            variant="ghost"
                            loading={busy}
                            onClick={() => void associateExisting(unit.id)}
                          >
                            Associar a {norma === "NR33" ? "NR-33" : "NR-35"}
                          </ActionButton>
                        </footer>
                      </li>
                    ))}
                  </ul>
                  {!units.data?.rows.length && (
                    <p className="nr-muted">
                      Nenhuma unidade ativa. Cadastre uma unidade para este contexto.
                    </p>
                  )}
                  <div className="nr-actions mt-3">
                    <ActionButton
                      variant="ghost"
                      disabled={unitPage === 0}
                      onClick={() => setUnitPage(unitPage - 1)}
                    >
                      Unidades anteriores
                    </ActionButton>
                    <ActionButton
                      variant="ghost"
                      disabled={(unitPage + 1) * 10 >= (units.data?.total ?? 0)}
                      onClick={() => setUnitPage(unitPage + 1)}
                    >
                      Mais unidades
                    </ActionButton>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}
      {contexto.clientes.length ? (
        [...contexto.clientes]
          .sort((a, b) => compare.compare(a.nome, b.nome))
          .map((client) => {
            const localUnits = contexto.unidades
              .filter((unit) => unit.cliente_id === client.id)
              .sort((a, b) => compare.compare(a.nome, b.nome));
            return (
              <article
                className="nr-panel nr-client-group"
                key={client.id}
                data-selected={search.cliente === client.id}
              >
                <header className="nr-panel-header">
                  <div>
                    <h3 className="nr-card-title">
                      <button
                        type="button"
                        className="nr-client-identity-button"
                        aria-expanded={!collapsed.has(client.id)}
                        aria-controls={`nr-client-units-${client.id}`}
                        onClick={() => toggleClient(client.id)}
                      >
                        <NrClientBrand client={client} />
                        <ChevronDown size={18} aria-hidden="true" />
                      </button>
                    </h3>
                    <p className="nr-muted mt-2">
                      {client.razao_social &&
                        client.razao_social !== client.nome &&
                        `${client.razao_social} · `}
                      {client.cnpj || "Identificação empresarial não informada"}
                    </p>
                    <p className="nr-muted">
                      {localUnits.length}{" "}
                      {localUnits.length === 1 ? "unidade associada" : "unidades associadas"}
                    </p>
                  </div>
                  <div className="nr-actions">
                    {canEditCadastro && (
                      <ActionButton
                        variant="ghost"
                        disabled={busy}
                        onClick={() => void edit("clientes", client.id, client.id)}
                      >
                        <Pencil size={15} />
                        Editar cliente
                      </ActionButton>
                    )}
                    {canEditCadastro && canAssociate && (
                      <ActionButton
                        variant="ghost"
                        onClick={() =>
                          setEditor({
                            grupo: "unidades",
                            row: null,
                            cliente: client.id,
                            associateAfterSave: true,
                          })
                        }
                      >
                        <Plus size={15} />
                        Nova unidade
                      </ActionButton>
                    )}
                  </div>
                </header>
                <div id={`nr-client-units-${client.id}`} hidden={collapsed.has(client.id)}>
                  <ul className="nr-card-grid" aria-label={`Unidades de ${client.nome}`}>
                    {localUnits.map((unit) => (
                      <li
                        key={unit.id}
                        className="nr-card nr-unit-card"
                        data-record-id={unit.id}
                        data-selected={search.unidade === unit.id}
                      >
                        <header className="nr-card-heading">
                          <div>
                            <p className="nr-card-category">
                              Unidade · {norma === "NR33" ? "NR-33" : "NR-35"}
                            </p>
                            <h4 className="nr-card-title">{unit.nome}</h4>
                          </div>
                          {search.unidade === unit.id && (
                            <span className="nr-badge">Contexto atual</span>
                          )}
                        </header>
                        <div className="nr-card-body">
                          <p>{unit.endereco || "Endereço não informado"}</p>
                          <p className="nr-muted">
                            {unit.cnpj || client.cnpj || "Identificação não informada"}
                          </p>
                          <div className="nr-card-section">
                            <p className="nr-card-category">Escopo</p>
                            <p>
                              {unit.escopo ||
                                unit.normas
                                  ?.map((norm) => (norm === "NR33" ? "NR-33" : "NR-35"))
                                  .join(" · ") ||
                                "Escopo em conferência"}
                            </p>
                          </div>
                          <div className="nr-card-section">
                            <p className="nr-card-category">Situação documental</p>
                            <p>{nrLabel(unit.situacao || "Situação não informada")}</p>
                            <dl className="nr-unit-summary mt-3">
                              <div>
                                <dt>Locais</dt>
                                <dd>{unit.locais ?? "Indisponível"}</dd>
                              </div>
                              <div>
                                <dt>Registros documentais</dt>
                                <dd>{unit.documentos ?? "Indisponível"}</dd>
                              </div>
                            </dl>
                            {typeof unit.documentos_origem === "number" && (
                              <p className="nr-muted mt-2">
                                {unit.documentos_origem} da origem · {unit.copias_editaveis ?? "—"}{" "}
                                cópias editáveis
                              </p>
                            )}
                            {unit.documentacao && (
                              <details className="text-sm mt-2">
                                <summary className="cursor-pointer">
                                  Detalhes da documentação
                                </summary>
                                <NrStructuredValue value={unit.documentacao} />
                              </details>
                            )}
                          </div>
                        </div>
                        <footer className="nr-card-actions">
                          <Link
                            to={String(base)}
                            search={contextSearch(client.id, unit.id)}
                            className="nr-card-open"
                          >
                            Abrir unidade
                            <ArrowRight size={16} />
                          </Link>
                          <div className="nr-actions">
                            <Link
                              to={String(`${base}/documentos`)}
                              search={contextSearch(client.id, unit.id)}
                              className="nr-card-link"
                            >
                              Documentos
                            </Link>
                            <Link
                              to={String(`${base}/pendencias`)}
                              search={contextSearch(client.id, unit.id)}
                              className="nr-card-link"
                            >
                              Pendências
                              {unit.pendencias_abertas === undefined
                                ? ""
                                : ` (${unit.pendencias_abertas})`}
                            </Link>
                            {canEditCadastro && (
                              <ActionButton
                                variant="ghost"
                                disabled={busy}
                                onClick={() => void edit("unidades", unit.id, client.id)}
                                aria-label={`Editar unidade ${unit.nome}`}
                              >
                                <Pencil size={15} />
                                Editar
                              </ActionButton>
                            )}
                          </div>
                        </footer>
                      </li>
                    ))}
                  </ul>
                  {!localUnits.length && (
                    <p className="nr-source">
                      Nenhuma unidade associada a este cliente no módulo. Use “Associar cadastro
                      existente” ou cadastre uma unidade.
                    </p>
                  )}
                </div>
              </article>
            );
          })
      ) : (
        <EmptyState
          title="Nenhum cliente associado a este módulo"
          hint="Associe uma unidade existente ou cadastre um novo cliente para iniciar o acervo."
        />
      )}
      {editor && (
        <CadastroEditor
          key={`${editor.grupo}/${editor.row?.id || "novo"}/${editor.cliente || ""}`}
          org={org}
          grupo={editor.grupo}
          cliente={editor.cliente}
          row={editor.row}
          onClose={() => setEditor(null)}
          onSaved={(row) => void saved(row)}
        />
      )}
    </section>
  );
}
