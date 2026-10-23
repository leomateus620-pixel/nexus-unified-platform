import { useQueryClient } from "@tanstack/react-query";
import * as Tabs from "@radix-ui/react-tabs";
import { ArrowLeft, Archive, Building2, Pencil, Plus, RefreshCw } from "lucide-react";
import { useId, useState } from "react";
import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
} from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { papelAutoriza } from "@/features/auth/autorizacao";
import { useCadastroList, useClienteDetail, useDebouncedSearch } from "./queries";
import { CadastroEditor } from "./CadastroEditor";
import type { Cadastro, CadastroGrupo, Cliente, SituacaoFiltro } from "./schemas";
import "@/components/nexus/stages.css";
import "./clientes.css";
import { PetHistoricoUnidade } from "@/features/pet/ExecucaoWorkspace";

export type ClientesSearch = {
  cliente: string;
  busca: string;
  situacao: SituacaoFiltro;
  pagina: number;
};
type Editor = { grupo: CadastroGrupo; row: Cadastro | null; archive?: boolean };

export function ClientesWorkspace({
  search,
  onSearch,
}: {
  search: ClientesSearch;
  onSearch: (patch: Partial<ClientesSearch>) => void;
}) {
  const org = useOrg();
  const orgId = org.data?.orgId ?? "";
  const canEdit = !!org.data && papelAutoriza(org.data.roles, "editar_cadastro");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [notice, setNotice] = useState("");
  const query = useCadastroList(
    orgId,
    "clientes",
    null,
    useDebouncedSearch(search.busca),
    search.situacao,
    search.pagina,
    25,
    !search.cliente,
  );
  const detail = useClienteDetail(orgId, search.cliente || null);
  const qc = useQueryClient();
  const id = useId();
  const saved = (row: Cadastro) => {
    setEditor(null);
    setNotice("Cadastro salvo no servidor.");
    void qc.invalidateQueries({ queryKey: ["clientes", orgId] });
    if (editor?.grupo === "clientes" && !editor.row) onSearch({ cliente: row.id });
  };
  return (
    <div className="nx-client-workspace space-y-5">
      <PageHeader
        eyebrow="Clientes"
        title={search.cliente ? "Ficha do cliente" : "Clientes, unidades e contatos"}
        description="Cadastros canônicos e histórico da organização."
        actions={
          !search.cliente && canEdit ? (
            <ActionButton onClick={() => setEditor({ grupo: "clientes", row: null })}>
              <Plus size={16} aria-hidden="true" /> Novo cliente
            </ActionButton>
          ) : undefined
        }
      />
      {notice && (
        <p role="status" className="rounded border border-border bg-card p-3 text-sm">
          {notice}
        </p>
      )}
      {search.cliente ? (
        <>
          <ActionButton variant="ghost" onClick={() => onSearch({ cliente: "" })}>
            <ArrowLeft size={16} aria-hidden="true" /> Voltar à lista
          </ActionButton>
          {detail.isPending ? (
            <LoadingState />
          ) : detail.isError ? (
            <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
          ) : (
            <ClienteFicha
              key={detail.data.id}
              org={orgId}
              cliente={detail.data}
              canEdit={canEdit}
              onEdit={setEditor}
            />
          )}
        </>
      ) : (
        <Section title="Cadastros" description="Busque por nome, identificador fiscal ou cidade.">
          <div className="nx-client-filters">
            <div>
              <label htmlFor={`${id}-search`}>Buscar cliente</label>
              <input
                id={`${id}-search`}
                type="search"
                maxLength={120}
                value={search.busca}
                placeholder="Nome, identificador ou cidade"
                onChange={(event) => onSearch({ busca: event.target.value, pagina: 0 })}
              />
            </div>
            <div>
              <label htmlFor={`${id}-status`}>Situação</label>
              <select
                id={`${id}-status`}
                value={search.situacao}
                onChange={(event) =>
                  onSearch({ situacao: event.target.value as SituacaoFiltro, pagina: 0 })
                }
              >
                <option value="ativos">Ativos</option>
                <option value="arquivados">Arquivados</option>
                <option value="todos">Todos</option>
              </select>
            </div>
            {(search.busca || search.situacao !== "ativos") && (
              <ActionButton
                variant="ghost"
                onClick={() => onSearch({ busca: "", situacao: "ativos", pagina: 0 })}
              >
                Limpar filtros
              </ActionButton>
            )}
          </div>
          {query.isPending ? (
            <LoadingState />
          ) : query.isError ? (
            <ErrorState error={query.error} onRetry={() => query.refetch()} />
          ) : (
            <>
              {query.data.rows.length === 0 ? (
                <EmptyState
                  title="Nenhum cliente encontrado"
                  hint={
                    search.busca || search.situacao !== "ativos"
                      ? "Ajuste os filtros para localizar outros cadastros."
                      : "Cadastre um cliente para organizar suas unidades e contatos."
                  }
                  action={
                    canEdit && !search.busca ? (
                      <ActionButton onClick={() => setEditor({ grupo: "clientes", row: null })}>
                        Novo cliente
                      </ActionButton>
                    ) : undefined
                  }
                />
              ) : (
                <ul className="nx-client-records" aria-label="Clientes encontrados">
                  {query.data.rows.map((cliente) => (
                    <li key={cliente.id}>
                      <button
                        type="button"
                        className="nx-client-open"
                        onClick={() => {
                          setNotice("");
                          onSearch({ cliente: cliente.id });
                        }}
                      >
                        <Building2 aria-hidden="true" size={20} />
                        <span className="min-w-0">
                          <strong>{cliente.nome_exibicao || cliente.razao_social}</strong>
                          <span>
                            {cliente.nome_exibicao && cliente.razao_social !== cliente.nome_exibicao
                              ? `${cliente.razao_social} · `
                              : ""}
                            {cliente.cnpj || "Sem identificador fiscal"}
                          </span>
                          <span>
                            {[cliente.cidade, cliente.uf].filter(Boolean).join(" / ") ||
                              "Cidade não informada"}
                          </span>
                        </span>
                        <span className="nx-client-situation">{cliente.situacao}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <Pagination
                total={query.data.total}
                page={search.pagina}
                onPage={(pagina) => onSearch({ pagina })}
                busy={query.isFetching}
              />
            </>
          )}
        </Section>
      )}
      {editor && (
        <CadastroEditor
          key={`${editor.grupo}-${editor.row?.id || "novo"}-${editor.archive ? "arquivo" : "editar"}`}
          org={orgId}
          grupo={editor.grupo}
          cliente={search.cliente || null}
          row={editor.row}
          archive={editor.archive ?? false}
          onClose={() => setEditor(null)}
          onSaved={saved}
        />
      )}
    </div>
  );
}

function ClienteFicha({
  org,
  cliente,
  canEdit,
  onEdit,
}: {
  org: string;
  cliente: Cliente;
  canEdit: boolean;
  onEdit: (editor: Editor) => void;
}) {
  const [tab, setTab] = useState("visao");
  const archived = cliente.situacao !== "Ativo";
  return (
    <div className="space-y-4">
      <Section
        title={cliente.nome_exibicao || cliente.razao_social}
        description={`Situação: ${cliente.situacao} · Versão ${cliente.version}`}
      >
        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <ActionButton
                variant="ghost"
                onClick={() => onEdit({ grupo: "clientes", row: cliente })}
              >
                <Pencil size={16} aria-hidden="true" /> Editar cliente
              </ActionButton>
              <ActionButton
                variant="ghost"
                onClick={() => onEdit({ grupo: "clientes", row: cliente, archive: true })}
              >
                {archived ? (
                  <RefreshCw size={16} aria-hidden="true" />
                ) : (
                  <Archive size={16} aria-hidden="true" />
                )}
                {archived ? "Reativar cliente" : "Arquivar cliente"}
              </ActionButton>
            </>
          )}
        </div>
        {archived && (
          <p className="mt-3 text-sm text-muted-foreground">
            Este cliente permanece no histórico. Reative-o para criar novos vínculos e propostas.
          </p>
        )}
      </Section>
      <Tabs.Root value={tab} onValueChange={setTab}>
        <Tabs.List aria-label="Informações do cliente" className="nx-client-tabs">
          {[
            ["visao", "Visão geral"],
            ["unidades", "Unidades"],
            ["contatos", "Contatos"],
            ["historico", "Histórico"],
          ].map(([value, label]) => (
            <Tabs.Trigger key={value} value={value!}>
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content value="visao" className="mt-4">
          <Section title="Informações cadastrais">
            <dl className="nx-client-facts">
              {[
                ["Razão social", cliente.razao_social],
                ["Nome de exibição", cliente.nome_exibicao],
                ["Identificador fiscal", cliente.cnpj],
                ["Cidade / UF", [cliente.cidade, cliente.uf].filter(Boolean).join(" / ")],
                ["Observações", cliente.observacoes],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value || "Não informado"}</dd>
                </div>
              ))}
            </dl>
          </Section>
        </Tabs.Content>
        <Tabs.Content value="unidades" className="mt-4">
          <VinculosCliente
            org={org}
            cliente={cliente}
            grupo="unidades"
            canEdit={canEdit}
            onEdit={onEdit}
          />
        </Tabs.Content>
        <Tabs.Content value="contatos" className="mt-4">
          <VinculosCliente
            org={org}
            cliente={cliente}
            grupo="contatos"
            canEdit={canEdit}
            onEdit={onEdit}
          />
        </Tabs.Content>
        <Tabs.Content value="historico" className="mt-4">
          <Historico org={org} cliente={cliente.id} />
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}

function VinculosCliente({
  org,
  cliente,
  grupo,
  canEdit,
  onEdit,
}: {
  org: string;
  cliente: Cliente;
  grupo: "unidades" | "contatos";
  canEdit: boolean;
  onEdit: (editor: Editor) => void;
}) {
  const [search, setSearch] = useState("");
  const [situacao, setSituacao] = useState<SituacaoFiltro>("ativos");
  const [page, setPage] = useState(0);
  const query = useCadastroList(org, grupo, cliente.id, useDebouncedSearch(search), situacao, page);
  const id = useId();
  const singular = grupo === "unidades" ? "unidade" : "contato";
  const title = grupo === "unidades" ? "Unidades" : "Contatos";
  const canCreate = canEdit && cliente.situacao === "Ativo";
  return (
    <Section title={title}>
      <div className="nx-client-filters">
        <div>
          <label htmlFor={`${id}-search`}>Buscar {singular}</label>
          <input
            id={`${id}-search`}
            type="search"
            maxLength={120}
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
          />
        </div>
        <div>
          <label htmlFor={`${id}-status`}>Situação</label>
          <select
            id={`${id}-status`}
            value={situacao}
            onChange={(event) => {
              setSituacao(event.target.value as SituacaoFiltro);
              setPage(0);
            }}
          >
            <option value="ativos">Ativos</option>
            <option value="arquivados">Arquivados</option>
            <option value="todos">Todos</option>
          </select>
        </div>
        {canCreate && (
          <ActionButton onClick={() => onEdit({ grupo, row: null })}>
            <Plus size={16} aria-hidden="true" />{" "}
            {grupo === "unidades" ? "Nova unidade" : "Novo contato"}
          </ActionButton>
        )}
      </div>
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          {query.data.rows.length === 0 ? (
            <EmptyState
              title={`Nenhum cadastro de ${singular} encontrado`}
              hint="Ajuste o recorte ou cadastre um novo vínculo."
              action={
                canCreate ? (
                  <ActionButton onClick={() => onEdit({ grupo, row: null })}>
                    {grupo === "unidades" ? "Nova unidade" : "Novo contato"}
                  </ActionButton>
                ) : undefined
              }
            />
          ) : (
            <ul className="nx-client-records" aria-label={title}>
              {query.data.rows.map((row) => (
                <li key={row.id} className="nx-client-child">
                  <span className="min-w-0">
                    <strong>{row.nome}</strong>
                    {"endereco" in row ? (
                      <>
                        <span>{row.endereco || "Endereço não informado"}</span>
                        {row.distancia_ida_volta_km !== null && (
                          <span>
                            {row.distancia_ida_volta_km.toLocaleString("pt-BR")} km · referência de
                            ida e volta
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <span>
                          {[row.cargo, row.email, row.telefone].filter(Boolean).join(" · ") ||
                            "Contato profissional não informado"}
                        </span>
                        {row.unidade_nome && <span>Unidade: {row.unidade_nome}</span>}
                      </>
                    )}
                    <span>
                      {row.arquivado_em ? "Arquivado" : "Ativo"} · versão {row.version}
                    </span>
                  </span>
                  {canEdit && (
                    <div className="flex flex-wrap gap-2">
                      <ActionButton
                        variant="ghost"
                        aria-label={`Editar ${singular} ${row.nome}`}
                        onClick={() => onEdit({ grupo, row })}
                      >
                        <Pencil size={15} aria-hidden="true" /> Editar
                      </ActionButton>
                      <ActionButton
                        variant="ghost"
                        aria-label={`${row.arquivado_em ? "Reativar" : "Arquivar"} ${singular} ${row.nome}`}
                        disabled={!!row.arquivado_em && cliente.situacao !== "Ativo"}
                        onClick={() => onEdit({ grupo, row, archive: true })}
                      >
                        {row.arquivado_em ? "Reativar" : "Arquivar"}
                      </ActionButton>
                    </div>
                  )}
                  {grupo === "unidades" && (
                    <details className="w-full mt-3">
                      <summary className="cursor-pointer min-h-11 py-2">
                        Histórico de PETs desta unidade
                      </summary>
                      <PetHistoricoUnidade unidadeId={row.id} />
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          <Pagination
            total={query.data.total}
            page={page}
            onPage={setPage}
            busy={query.isFetching}
          />
        </>
      )}
    </Section>
  );
}

function Historico({ org, cliente }: { org: string; cliente: string }) {
  const [page, setPage] = useState(0);
  const query = useCadastroList(org, "historico", cliente, "", "todos", page);
  return (
    <Section
      title="Histórico cadastral"
      description="Autoria e versões são registradas no servidor. Vínculos operacionais aparecem à medida que seus módulos forem integrados."
    >
      {query.isPending ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          {query.data.rows.length ? (
            <ol className="nx-client-records">
              {query.data.rows.map((row) => (
                <li key={row.id} className="nx-client-child">
                  <span>
                    <strong>
                      {row.unidade_id ? "Unidade" : row.contato_id ? "Contato" : "Cliente"} ·{" "}
                      {row.operacao}
                    </strong>
                    <span>
                      Versão {row.versao} ·{" "}
                      <time dateTime={row.created_at}>
                        {new Date(row.created_at).toLocaleString("pt-BR", {
                          timeZone: "America/Sao_Paulo",
                        })}
                      </time>
                    </span>
                    {row.motivo && <span>Motivo: {row.motivo}</span>}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <EmptyState
              title="Sem mudanças registradas após a atualização cadastral"
              hint="A autoria de registros anteriores não é preenchida retroativamente."
            />
          )}
          <Pagination
            total={query.data.total}
            page={page}
            onPage={setPage}
            busy={query.isFetching}
          />
        </>
      )}
    </Section>
  );
}

function Pagination({
  total,
  page,
  onPage,
  busy,
}: {
  total: number;
  page: number;
  onPage: (page: number) => void;
  busy: boolean;
}) {
  const pages = Math.max(1, Math.ceil(total / 25));
  return (
    <nav aria-label="Paginação dos cadastros" className="nx-client-pagination">
      <p role="status">
        {total} registro(s) · página {page + 1} de {pages}
        {busy ? " · atualizando" : ""}
      </p>
      <div className="flex gap-2">
        <ActionButton
          variant="ghost"
          onClick={() => onPage(Math.max(0, page - 1))}
          disabled={page === 0 || busy}
        >
          Anterior
        </ActionButton>
        <ActionButton
          variant="ghost"
          onClick={() => onPage(page + 1)}
          disabled={(page + 1) * 25 >= total || busy}
        >
          Próxima
        </ActionButton>
      </div>
    </nav>
  );
}
