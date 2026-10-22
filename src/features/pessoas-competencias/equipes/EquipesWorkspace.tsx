import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ActionButton,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  Section,
} from "@/components/nexus/Page";
import { fieldClass, Pagination } from "@/features/operacao/components";
import type { OperationalAccess } from "@/features/operacao/access";
import { captureOperationalContinuation } from "@/features/operacao/continuation";
import { acessoEquipeNegado, EQUIPE_ACESSO_INDISPONIVEL, periodoMembro } from "./domain";
import {
  encerrarMembroEquipe,
  listarEquipes,
  obterEquipe,
  salvarEquipe,
  vincularMembroEquipe,
} from "./functions";
import { EquipesForm, type EquipeEditor, type EquipeFormCommand } from "./EquipesForms";
import { equipesKeys, useEquipe, useEquipes } from "./queries";
import type { Equipe, EquipesSearch } from "./types";

export type EquipesWorkspaceProps = {
  orgId: string;
  userId: string;
  access: OperationalAccess;
  search: EquipesSearch;
  onSearch: (patch: Partial<EquipesSearch>) => void;
  onOpenPessoa?: (id: string) => void;
};
export function EquipesWorkspace(props: EquipesWorkspaceProps) {
  return (
    <EquipesContent
      key={`${props.orgId}:${props.userId}:${JSON.stringify(props.access)}`}
      {...props}
    />
  );
}
function EquipesContent({
  orgId,
  userId,
  access,
  search,
  onSearch,
  onOpenPessoa,
}: EquipesWorkspaceProps) {
  const client = useQueryClient(),
    read = useServerFn(obterEquipe),
    list = useServerFn(listarEquipes);
  const save = useServerFn(salvarEquipe),
    include = useServerFn(vincularMembroEquipe),
    end = useServerFn(encerrarMembroEquipe);
  const [term, setTerm] = useState(search.busca),
    [editor, setEditor] = useState<EquipeEditor | null>(null);
  const [boundaryError, setBoundaryError] = useState<unknown>(null),
    [retryError, setRetryError] = useState<unknown>(null);
  const [saved, setSaved] = useState(""),
    [retrying, setRetrying] = useState(false);
  const trigger = useRef<HTMLElement | null>(null),
    detailRegion = useRef<HTMLDivElement>(null),
    listRegion = useRef<HTMLDivElement>(null),
    feedback = useRef<HTMLDivElement>(null);
  const lifecycle = useRef({ active: false, generation: 0 }),
    cleanup = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => {
    const scope = lifecycle.current;
    scope.active = true;
    scope.generation++;
    return () => {
      scope.active = false;
      scope.generation++;
    };
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => setTerm(search.busca), 300);
    return () => clearTimeout(timer);
  }, [search.busca]);
  const continuation = () => {
    const generation = lifecycle.current.generation;
    return captureOperationalContinuation(
      client,
      ["operacao-acesso", orgId, userId],
      () => lifecycle.current.active && lifecycle.current.generation === generation,
    );
  };
  const q = useEquipes(
    orgId,
    { busca: term, pagina: search.pagina, arquivadas: search.arquivadas },
    !boundaryError,
  );
  const detail = useEquipe(orgId, search.equipe, search.paginaMembros, !boundaryError);
  const denied = !!boundaryError || acessoEquipeNegado(q.error) || acessoEquipeNegado(detail.error);
  const current = !denied && !detail.isError ? detail.data : undefined;
  const canManage = !denied && access.gerirEquipe && q.data?.permissoes.gerir === true;
  const deny = useCallback((error: unknown) => {
    if (acessoEquipeNegado(error)) setBoundaryError(error);
  }, []);
  useEffect(() => {
    if (!denied) return;
    setBoundaryError(new Error(EQUIPE_ACESSO_INDISPONIVEL));
    setEditor(null);
    setSaved("");
    const filter = { queryKey: equipesKeys.all(orgId) };
    cleanup.current = client.cancelQueries(filter).then(() => {
      client.removeQueries(filter);
    });
    requestAnimationFrame(() => feedback.current?.focus());
  }, [denied, orgId, client]);
  useEffect(() => {
    if (current?.equipe.id && window.innerWidth < 1280)
      requestAnimationFrame(() => {
        detailRegion.current?.scrollIntoView({ block: "start", behavior: "auto" });
        detailRegion.current?.focus({ preventScroll: true });
      });
  }, [current?.equipe.id]);
  const select = (row: Equipe) => {
    if (document.activeElement instanceof HTMLElement) trigger.current = document.activeElement;
    setSaved("");
    onSearch({ equipe: row.id, paginaMembros: 0 });
  };
  const back = () => {
    onSearch({ equipe: "", paginaMembros: 0 });
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : listRegion.current)?.focus(),
    );
  };
  async function execute(command: EquipeFormCommand) {
    const valid = continuation();
    try {
      const result =
        command.tipo === "equipe"
          ? await save({ data: command.data })
          : command.tipo === "incluir"
            ? await include({ data: command.data })
            : await end({ data: command.data });
      if (!valid()) return false;
      client.setQueryData(equipesKeys.detail(orgId, result.equipe.id, 0), result);
      setEditor(null);
      setSaved(
        command.tipo === "equipe"
          ? "Equipe confirmada no servidor."
          : command.tipo === "incluir"
            ? "Participação confirmada no servidor."
            : "Encerramento confirmado; o período foi preservado.",
      );
      onSearch({ equipe: result.equipe.id, paginaMembros: 0 });
      await client.invalidateQueries({ queryKey: equipesKeys.all(orgId) });
      return true;
    } catch (error) {
      if (!valid()) return false;
      deny(error);
      throw error;
    }
  }
  async function compare(id: string, pagina: number) {
    const valid = continuation();
    try {
      const result = await read({ data: { organization_id: orgId, id, paginaMembros: pagina } });
      if (!valid()) return undefined;
      client.setQueryData(equipesKeys.detail(orgId, id, pagina), result);
      return result;
    } catch (error) {
      if (!valid()) return undefined;
      deny(error);
      throw error;
    }
  }
  async function retry() {
    setRetrying(true);
    setRetryError(null);
    const valid = continuation();
    try {
      await cleanup.current;
      const [rows, ficha] = await Promise.all([
        list({
          data: {
            organization_id: orgId,
            busca: term,
            pagina: search.pagina,
            arquivadas: search.arquivadas,
          },
        }),
        search.equipe
          ? read({
              data: {
                organization_id: orgId,
                id: search.equipe,
                paginaMembros: search.paginaMembros,
              },
            })
          : Promise.resolve(null),
      ]);
      if (!valid()) return;
      client.setQueryData(
        equipesKeys.list(orgId, {
          busca: term,
          pagina: search.pagina,
          arquivadas: search.arquivadas,
        }),
        rows,
      );
      if (ficha)
        client.setQueryData(equipesKeys.detail(orgId, search.equipe, search.paginaMembros), ficha);
      setBoundaryError(null);
    } catch (error) {
      if (valid()) setRetryError(error);
    } finally {
      if (valid()) setRetrying(false);
    }
  }
  return (
    <div className="space-y-4">
      {denied ? (
        <div ref={feedback} tabIndex={-1} className="outline-none">
          <ErrorState
            error={retryError || boundaryError || new Error(EQUIPE_ACESSO_INDISPONIVEL)}
            onRetry={() => {
              if (!retrying) void retry();
            }}
          />
        </div>
      ) : (
        <>
          <div className={`${search.equipe ? "hidden xl:flex" : "flex"} flex-wrap items-end gap-3`}>
            <label className="grid min-w-0 flex-1 gap-1 text-sm">
              Buscar equipe
              <input
                className={fieldClass}
                type="search"
                value={search.busca}
                maxLength={120}
                placeholder="Nome"
                onChange={(e) => onSearch({ busca: e.target.value, pagina: 0 })}
              />
            </label>
            <label className="grid gap-1 text-sm">
              Situação da equipe
              <select
                className={fieldClass}
                value={String(search.arquivadas)}
                onChange={(e) => onSearch({ arquivadas: e.target.value === "true", pagina: 0 })}
              >
                <option value="false">Ativas</option>
                <option value="true">Arquivadas</option>
              </select>
            </label>
            {canManage && (
              <ActionButton
                onClick={() => {
                  setSaved("");
                  setEditor({ tipo: "equipe", base: null });
                }}
              >
                Nova equipe
              </ActionButton>
            )}
            {(search.busca || search.arquivadas) && (
              <ActionButton
                variant="ghost"
                onClick={() => onSearch({ busca: "", pagina: 0, arquivadas: false })}
              >
                Limpar filtros
              </ActionButton>
            )}
          </div>
          {term !== search.busca && (
            <p role="status" className="text-sm text-muted-foreground">
              Atualizando busca…
            </p>
          )}
          {saved && (
            <p role="status" className="rounded border border-border p-3 text-sm">
              {saved}
            </p>
          )}
          <div
            className={`grid min-w-0 gap-4 ${search.equipe ? "xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]" : ""}`}
          >
            <div
              ref={listRegion}
              tabIndex={-1}
              className={`min-w-0 outline-none ${search.equipe ? "hidden xl:block" : ""}`}
            >
              <Section
                title="Equipes"
                description="Vínculos por período preservam quem integrou a equipe."
              >
                {q.isPending ? (
                  <LoadingState label="Consultando equipes…" />
                ) : q.isError ? (
                  <ErrorState error={q.error} onRetry={() => q.refetch()} />
                ) : (
                  q.data && (
                    <>
                      {!q.data.rows.length ? (
                        <EmptyState
                          title="Nenhuma equipe neste recorte"
                          hint={
                            canManage
                              ? "Cadastre uma equipe ou ajuste os filtros."
                              : "Ajuste os filtros para consultar as equipes autorizadas."
                          }
                        />
                      ) : (
                        <>
                          <div className={`space-y-3 ${search.equipe ? "" : "md:hidden"}`}>
                            {q.data.rows.map((row) => (
                              <article key={row.id} className="rounded border border-border p-3">
                                <p className="break-words font-medium">{row.nome}</p>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {row.ativa ? "Ativa" : "Arquivada"} · versão {row.version}
                                </p>
                                <ActionButton
                                  variant="ghost"
                                  className="mt-3 min-h-11"
                                  aria-label={`Abrir equipe ${row.nome}`}
                                  onClick={() => select(row)}
                                >
                                  Abrir equipe
                                </ActionButton>
                              </article>
                            ))}
                          </div>
                          <div className={search.equipe ? "hidden" : "hidden md:block"}>
                            <DataTable
                              rows={q.data.rows}
                              getRowId={(row) => row.id}
                              onRowClick={select}
                              selectedId={search.equipe || null}
                              label="Equipes operacionais"
                              columns={[
                                { key: "nome", label: "Equipe" },
                                {
                                  key: "ativa",
                                  label: "Situação",
                                  render: (row) => (row.ativa ? "Ativa" : "Arquivada"),
                                },
                                { key: "version", label: "Versão" },
                              ]}
                            />
                          </div>
                        </>
                      )}
                      <Pagination
                        page={search.pagina}
                        total={q.data.total}
                        onChange={(pagina) => onSearch({ pagina })}
                      />
                    </>
                  )
                )}
              </Section>
            </div>
            {search.equipe && (
              <div
                ref={detailRegion}
                tabIndex={-1}
                role="region"
                aria-label="Ficha da equipe"
                className="min-w-0 scroll-mt-20 outline-none"
              >
                <ActionButton variant="ghost" className="mb-3" onClick={back}>
                  Voltar à lista de equipes
                </ActionButton>
                {detail.isPending ? (
                  <LoadingState label="Consultando equipe e vigências…" />
                ) : detail.isError ? (
                  <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
                ) : (
                  current && (
                    <Section
                      title={current.equipe.nome}
                      description={`${current.equipe.ativa ? "Ativa" : "Arquivada"} · versão ${current.equipe.version}`}
                      actions={
                        current.permissoes.editar && access.gerirEquipe ? (
                          <ActionButton
                            variant="ghost"
                            onClick={() => setEditor({ tipo: "equipe", base: current })}
                          >
                            Editar equipe e situação
                          </ActionButton>
                        ) : undefined
                      }
                    >
                      <dl className="mb-4 text-sm">
                        <dt className="text-muted-foreground">Líder atual</dt>
                        <dd>
                          {current.lider?.nome ||
                            (current.equipe.lider_id
                              ? "Identificação não disponível neste recorte"
                              : "Sem líder definido")}
                          {current.lider && !current.lider.ativa ? " · pessoa arquivada" : ""}
                        </dd>
                      </dl>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-sm font-semibold">Pessoas e vigências</h3>
                        {current.permissoes.incluir && access.gerirEquipe && (
                          <ActionButton
                            onClick={() => setEditor({ tipo: "incluir", base: current })}
                          >
                            Incluir pessoa
                          </ActionButton>
                        )}
                      </div>
                      {!access.gerirEquipe && (
                        <p className="mb-3 text-sm text-muted-foreground">
                          Seu perfil consulta somente seus próprios vínculos autorizados.
                        </p>
                      )}
                      {!current.membros.rows.length ? (
                        <EmptyState
                          title="Nenhuma participação neste recorte"
                          hint={
                            current.permissoes.incluir
                              ? "Inclua uma pessoa com as datas de participação."
                              : "Não há vínculos disponíveis para seu acesso nesta página."
                          }
                        />
                      ) : (
                        <ul className="space-y-3">
                          {current.membros.rows.map((member) => (
                            <li
                              key={member.id}
                              className="rounded border border-border p-3 text-sm"
                            >
                              <p className="break-words font-medium">
                                {member.pessoa_nome || "Identificação não disponível"}
                              </p>
                              {member.pessoa_funcao && (
                                <p className="text-muted-foreground">{member.pessoa_funcao}</p>
                              )}
                              <p className="mt-1 tabular-nums">
                                {periodoMembro(member.inicio, member.fim)}
                              </p>
                              {member.pessoa_ativa === false && (
                                <p className="text-muted-foreground">
                                  Pessoa arquivada; participação histórica preservada.
                                </p>
                              )}
                              {member.pessoa_nome && onOpenPessoa && (
                                <ActionButton
                                  variant="ghost"
                                  className="mt-3 min-h-11"
                                  onClick={() => onOpenPessoa(member.pessoa_id)}
                                >
                                  Abrir cadastro da pessoa
                                </ActionButton>
                              )}
                              {member.pode_encerrar && access.gerirEquipe && (
                                <ActionButton
                                  variant="ghost"
                                  className="mt-3 min-h-11"
                                  onClick={() =>
                                    setEditor({ tipo: "encerrar", base: current, membro: member })
                                  }
                                >
                                  Encerrar participação
                                </ActionButton>
                              )}
                            </li>
                          ))}
                        </ul>
                      )}
                      <Pagination
                        page={search.paginaMembros}
                        total={current.membros.total}
                        onChange={(paginaMembros) => onSearch({ paginaMembros })}
                      />
                    </Section>
                  )
                )}
              </div>
            )}
          </div>
        </>
      )}
      {!denied && editor && (
        <EquipesForm
          orgId={orgId}
          editor={editor}
          execute={execute}
          compare={compare}
          onClose={() => setEditor(null)}
          onDenied={deny}
        />
      )}
    </div>
  );
}
