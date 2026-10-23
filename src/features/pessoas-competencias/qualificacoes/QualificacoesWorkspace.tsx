import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { RecordFiles } from "@/features/operacao/RecordFiles";
import {
  listarCompetencias,
  listarQualificacoes,
  obterCompetencia,
  obterQualificacao,
  salvarCompetencia,
  salvarQualificacao,
  transicionarQualificacao,
} from "./functions";
import {
  acessoQualificacaoNegado,
  estadoLabels,
  proximasDecisoes,
  QUALIFICACAO_ACESSO_INDISPONIVEL,
  situacaoNaData,
} from "./domain";
import {
  QualificationForm,
  QualificationPicker,
  type QualificationCommand,
  type QualificationEditor,
} from "./Forms";
import { qualificacoesFreshness, qualificacoesKeys } from "./queries";
import { estadoQualificacao } from "./schemas";
import type { CompetenciaDetalhe, QualificacaoDetalhe, QualificacoesSearch } from "./types";

export type QualificacoesWorkspaceProps = {
  orgId: string;
  userId: string;
  access: OperationalAccess;
  search: QualificacoesSearch;
  onSearch: (patch: Partial<QualificacoesSearch>) => void;
  onOpenPessoa?: ((id: string) => void) | undefined;
};
export function QualificacoesWorkspace(props: QualificacoesWorkspaceProps) {
  return (
    <QualificationContent
      key={
        props.orgId +
        ":" +
        props.userId +
        ":" +
        JSON.stringify(props.access) +
        ":" +
        props.search.area
      }
      {...props}
    />
  );
}
const civil = (date: string | null) =>
  date ? date.split("-").reverse().join("/") : "Não declarada";
const today = () => {
  const d = new Date();
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
};
function QualificationContent({
  orgId,
  userId,
  access,
  search,
  onSearch,
  onOpenPessoa,
}: QualificacoesWorkspaceProps) {
  const client = useQueryClient(),
    loadC = useServerFn(listarCompetencias),
    loadQ = useServerFn(listarQualificacoes);
  const readC = useServerFn(obterCompetencia),
    readQ = useServerFn(obterQualificacao);
  const saveC = useServerFn(salvarCompetencia),
    saveQ = useServerFn(salvarQualificacao),
    decide = useServerFn(transicionarQualificacao);
  const [term, setTerm] = useState(search.busca),
    [editor, setEditor] = useState<QualificationEditor | null>(null);
  const [boundary, setBoundary] = useState<unknown>(null),
    [retryError, setRetryError] = useState<unknown>(null),
    [retrying, setRetrying] = useState(false);
  const [saved, setSaved] = useState(""),
    [date, setDate] = useState(today);
  const editorRef = useRef(editor);
  editorRef.current = editor;
  const feedback = useRef<HTMLDivElement>(null),
    detailRegion = useRef<HTMLDivElement>(null),
    listRegion = useRef<HTMLDivElement>(null),
    trigger = useRef<HTMLElement | null>(null);
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
  const isC = search.area === "competencias",
    selected = isC ? search.competencia : search.qualificacao;
  const cInput = {
    organization_id: orgId,
    busca: term,
    pagina: search.pagina,
    arquivadas: search.arquivadas,
  };
  const qInput = {
    organization_id: orgId,
    busca: term,
    pagina: search.pagina,
    pessoa_id: search.pessoaFiltro || null,
    competencia_id: null,
    estado: estadoQualificacao.safeParse(search.estado).success
      ? estadoQualificacao.parse(search.estado)
      : null,
  };
  const cKey = ["pessoas", orgId, "competencias", cInput],
    qKey = ["pessoas", orgId, "qualificacoes", qInput];
  const cs = useQuery({
    queryKey: cKey,
    enabled: isC && !boundary,
    ...qualificacoesFreshness,
    queryFn: ({ signal }) => loadC({ data: cInput, signal }),
  });
  const qs = useQuery({
    queryKey: qKey,
    enabled: !isC && !boundary,
    ...qualificacoesFreshness,
    queryFn: ({ signal }) => loadQ({ data: qInput, signal }),
  });
  const cd = useQuery({
    queryKey: qualificacoesKeys.competencia(orgId, selected),
    enabled: isC && !!selected && !boundary,
    ...qualificacoesFreshness,
    queryFn: ({ signal }) => readC({ data: { organization_id: orgId, id: selected }, signal }),
  });
  const qd = useQuery({
    queryKey: qualificacoesKeys.qualificacao(orgId, selected),
    enabled: !isC && !!selected && !boundary,
    ...qualificacoesFreshness,
    queryFn: ({ signal }) => readQ({ data: { organization_id: orgId, id: selected }, signal }),
  });
  const list = isC ? cs : qs,
    detail = isC ? cd : qd;
  const denied =
    !!boundary ||
    acessoQualificacaoNegado(list.error) ||
    (!!selected && acessoQualificacaoNegado(detail.error));
  const currentC = !denied && !cd.isError && isC && selected ? cd.data : undefined;
  const currentQ = !denied && !qd.isError && !isC && selected ? qd.data : undefined;
  const deny = useCallback((error: unknown) => {
    if (acessoQualificacaoNegado(error)) setBoundary(error);
  }, []);
  useEffect(() => {
    if (!denied) return;
    setBoundary(new Error(QUALIFICACAO_ACESSO_INDISPONIVEL));
    setEditor(null);
    setSaved("");
    const filter = { queryKey: qualificacoesKeys.all(orgId) };
    cleanup.current = client.cancelQueries(filter).then(() => {
      client.removeQueries(filter);
    });
    requestAnimationFrame(() => feedback.current?.focus());
  }, [denied, client, orgId]);
  const visibleDetailId = currentC?.registro.id || currentQ?.registro.id;
  useEffect(() => {
    if (visibleDetailId && window.innerWidth < 1280)
      requestAnimationFrame(() => {
        detailRegion.current?.scrollIntoView({ block: "start" });
        detailRegion.current?.focus({ preventScroll: true });
      });
  }, [visibleDetailId]);
  const select = (id: string) => {
    if (document.activeElement instanceof HTMLElement) trigger.current = document.activeElement;
    setSaved("");
    onSearch(isC ? { competencia: id } : { qualificacao: id });
  };
  const back = () => {
    onSearch(isC ? { competencia: "" } : { qualificacao: "" });
    requestAnimationFrame(() =>
      (trigger.current?.isConnected ? trigger.current : listRegion.current)?.focus(),
    );
  };
  async function execute(command: QualificationCommand) {
    const valid = continuation(),
      opened = editorRef.current;
    try {
      let id: string;
      if (command.tipo === "competencia") {
        const data = await saveC({ data: command.data });
        if (!valid() || editorRef.current !== opened) return false;
        id = data.registro.id;
        client.setQueryData(qualificacoesKeys.competencia(orgId, id), data);
      } else {
        const data =
          command.tipo === "qualificacao"
            ? await saveQ({ data: command.data })
            : await decide({ data: command.data });
        if (!valid() || editorRef.current !== opened) return false;
        id = data.registro.id;
        client.setQueryData(qualificacoesKeys.qualificacao(orgId, id), data);
      }
      setEditor(null);
      setSaved(
        command.tipo === "decisao"
          ? "Decisão confirmada no servidor."
          : "Cadastro confirmado no servidor.",
      );
      onSearch(command.tipo === "competencia" ? { competencia: id } : { qualificacao: id });
      await client.invalidateQueries({ queryKey: qualificacoesKeys.all(orgId) });
      return true;
    } catch (error) {
      if (!valid() || editorRef.current !== opened) return false;
      deny(error);
      throw error;
    }
  }
  async function compare(
    opened: QualificationEditor,
  ): Promise<CompetenciaDetalhe | QualificacaoDetalhe | undefined> {
    if (!opened.base) return undefined;
    const valid = continuation(),
      active = editorRef.current;
    try {
      const data =
        opened.tipo === "competencia"
          ? await readC({ data: { organization_id: orgId, id: opened.base.registro.id } })
          : await readQ({ data: { organization_id: orgId, id: opened.base.registro.id } });
      if (!valid() || editorRef.current !== active) return undefined;
      return data;
    } catch (error) {
      if (!valid() || editorRef.current !== active) return undefined;
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
      if (isC) {
        const [rows, ficha] = await Promise.all([
          loadC({ data: cInput }),
          selected
            ? readC({ data: { organization_id: orgId, id: selected } })
            : Promise.resolve(null),
        ]);
        if (!valid()) return;
        client.setQueryData(cKey, rows);
        if (ficha) client.setQueryData(qualificacoesKeys.competencia(orgId, selected), ficha);
      } else {
        const [rows, ficha] = await Promise.all([
          loadQ({ data: qInput }),
          selected
            ? readQ({ data: { organization_id: orgId, id: selected } })
            : Promise.resolve(null),
        ]);
        if (!valid()) return;
        client.setQueryData(qKey, rows);
        if (ficha) client.setQueryData(qualificacoesKeys.qualificacao(orgId, selected), ficha);
      }
      setBoundary(null);
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
            error={retryError || boundary || new Error(QUALIFICACAO_ACESSO_INDISPONIVEL)}
            onRetry={() => {
              if (!retrying) void retry();
            }}
          />
        </div>
      ) : (
        <>
          <div
            className={
              selected
                ? "hidden flex-wrap items-end gap-3 xl:flex"
                : "flex flex-wrap items-end gap-3"
            }
          >
            <label className="grid min-w-0 flex-1 basis-48 gap-1 text-sm">
              {isC ? "Buscar competência" : "Buscar pelo emissor"}
              <input
                type="search"
                className={fieldClass}
                value={search.busca}
                maxLength={120}
                onChange={(e) => onSearch({ busca: e.target.value, pagina: 0 })}
              />
            </label>
            {isC ? (
              <label className="flex min-h-11 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={search.arquivadas}
                  onChange={(e) => onSearch({ arquivadas: e.target.checked, pagina: 0 })}
                />
                Mostrar arquivadas
              </label>
            ) : (
              <label className="grid gap-1 text-sm">
                Estado
                <select
                  className={fieldClass}
                  value={search.estado}
                  onChange={(e) => onSearch({ estado: e.target.value, pagina: 0 })}
                >
                  <option value="">Todos</option>
                  {Object.entries(estadoLabels).map(([id, label]) => (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ActionButton
              variant="ghost"
              onClick={() =>
                onSearch({ busca: "", pagina: 0, arquivadas: false, pessoaFiltro: "", estado: "" })
              }
            >
              Limpar filtros
            </ActionButton>
          </div>
          {!isC && access.gerirEquipe && (
            <details
              className={
                selected
                  ? "hidden rounded border border-border p-3 text-sm xl:block"
                  : "rounded border border-border p-3 text-sm"
              }
            >
              <summary className="min-h-11 cursor-pointer">
                Filtrar por pessoa{search.pessoaFiltro ? " · filtro ativo" : ""}
              </summary>
              <QualificationPicker
                org={orgId}
                tipo="pessoas"
                label="Pessoa do filtro"
                required={false}
                value={search.pessoaFiltro}
                onDenied={deny}
                onChange={(id) => onSearch({ pessoaFiltro: id, pagina: 0 })}
              />
            </details>
          )}
          {saved && (
            <p role="status" className="rounded border border-border p-3 text-sm">
              {saved}
            </p>
          )}
          <div className={selected ? "grid min-w-0 gap-4 xl:grid-cols-2" : "min-w-0"}>
            <div
              ref={listRegion}
              tabIndex={-1}
              className={`min-w-0 outline-none ${selected ? "hidden xl:block" : ""}`}
            >
              <Section
                title={isC ? "Políticas de competência" : "Qualificações e conferência"}
                description={
                  isC
                    ? "Requisitos cadastrados pela organização."
                    : "Comprovantes e validação para o contexto autorizado."
                }
                actions={
                  !list.isError &&
                  list.data?.permissoes.criar && (
                    <ActionButton
                      onClick={() =>
                        setEditor(
                          isC
                            ? { tipo: "competencia", base: null }
                            : { tipo: "qualificacao", base: null },
                        )
                      }
                    >
                      {isC ? "Nova competência" : "Registrar qualificação"}
                    </ActionButton>
                  )
                }
              >
                {list.isPending ? (
                  <LoadingState label="Consultando registros autorizados…" />
                ) : list.isError ? (
                  <ErrorState error={list.error} onRetry={() => list.refetch()} />
                ) : isC && cs.data ? (
                  <>
                    {!cs.data.rows.length ? (
                      <EmptyState
                        title="Nenhuma competência neste recorte"
                        hint="Ajuste os filtros ou cadastre os requisitos utilizados pela organização."
                      />
                    ) : (
                      <>
                        <ul className={`space-y-3 ${selected ? "" : "md:hidden"}`}>
                          {cs.data.rows.map((row) => (
                            <li key={row.id}>
                              <button
                                type="button"
                                className="min-h-11 w-full rounded border border-border p-3 text-left text-sm"
                                onClick={() => select(row.id)}
                              >
                                <span className="block break-words font-medium">{row.nome}</span>
                                <span>
                                  {row.ativa ? "Ativa" : "Arquivada"} · V{row.version}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        <div className={selected ? "hidden" : "hidden md:block"}>
                          <DataTable
                            rows={cs.data.rows}
                            getRowId={(r) => r.id}
                            onRowClick={(r) => select(r.id)}
                            selectedId={selected}
                            label="Competências cadastradas"
                            columns={[
                              { key: "nome", label: "Competência" },
                              {
                                key: "ativa",
                                label: "Situação",
                                render: (r) => (r.ativa ? "Ativa" : "Arquivada"),
                              },
                              {
                                key: "exige_evidencia",
                                label: "Comprovante",
                                render: (r) => (r.exige_evidencia ? "Exigido" : "Opcional"),
                              },
                              { key: "version", label: "Versão" },
                            ]}
                          />
                        </div>
                      </>
                    )}
                    <Pagination
                      page={search.pagina}
                      total={cs.data.total}
                      onChange={(pagina) => onSearch({ pagina })}
                    />
                  </>
                ) : (
                  qs.data && (
                    <>
                      {!qs.data.rows.length ? (
                        <EmptyState
                          title="Nenhuma qualificação neste recorte"
                          hint="Ajuste os filtros ou registre a qualificação de uma pessoa autorizada."
                        />
                      ) : (
                        <>
                          <ul className={`space-y-3 ${selected ? "" : "md:hidden"}`}>
                            {qs.data.rows.map((row) => (
                              <li key={row.id}>
                                <button
                                  type="button"
                                  className="min-h-11 w-full rounded border border-border p-3 text-left text-sm"
                                  onClick={() => select(row.id)}
                                >
                                  <span className="block break-words font-medium">
                                    {row.pessoa?.nome || "Pessoa não disponível"}
                                  </span>
                                  <span className="block break-words">
                                    {row.competencia?.nome || "Competência não disponível"}
                                  </span>
                                  <span>
                                    {estadoLabels[row.estado]} · Validade: {civil(row.validade)}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                          <div className={selected ? "hidden" : "hidden md:block"}>
                            <DataTable
                              rows={qs.data.rows}
                              getRowId={(r) => r.id}
                              onRowClick={(r) => select(r.id)}
                              selectedId={selected}
                              label="Qualificações autorizadas"
                              columns={[
                                {
                                  key: "pessoa",
                                  label: "Pessoa",
                                  render: (r) => r.pessoa?.nome || "Não disponível",
                                },
                                {
                                  key: "competencia",
                                  label: "Competência",
                                  render: (r) => r.competencia?.nome || "Não disponível",
                                },
                                {
                                  key: "estado",
                                  label: "Estado",
                                  render: (r) => estadoLabels[r.estado],
                                },
                                {
                                  key: "validade",
                                  label: "Validade",
                                  render: (r) => civil(r.validade),
                                },
                              ]}
                            />
                          </div>
                        </>
                      )}
                      <Pagination
                        page={search.pagina}
                        total={qs.data.total}
                        onChange={(pagina) => onSearch({ pagina })}
                      />
                    </>
                  )
                )}
              </Section>
            </div>
            {!!selected && (
              <div
                ref={detailRegion}
                tabIndex={-1}
                aria-label={isC ? "Ficha da competência" : "Ficha da qualificação"}
                role="region"
                className="min-w-0 scroll-mt-20 outline-none"
              >
                <ActionButton variant="ghost" className="mb-3" onClick={back}>
                  Voltar à lista
                </ActionButton>
                {detail.isPending ? (
                  <LoadingState label="Consultando ficha…" />
                ) : detail.isError ? (
                  <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
                ) : currentC ? (
                  <Section
                    title={currentC.registro.nome}
                    description={
                      (currentC.registro.ativa ? "Ativa" : "Arquivada") +
                      " · versão " +
                      currentC.registro.version
                    }
                    actions={
                      currentC.permissoes.editar &&
                      access.revisarOperacao && (
                        <ActionButton
                          variant="ghost"
                          onClick={() => setEditor({ tipo: "competencia", base: currentC })}
                        >
                          Editar política e situação
                        </ActionButton>
                      )
                    }
                  >
                    <p className="whitespace-pre-wrap break-words text-sm">
                      {currentC.registro.descricao || "Sem descrição adicional."}
                    </p>
                    <dl className="mt-4 grid gap-2 text-sm">
                      <div>
                        <dt className="text-muted-foreground">Comprovante para validar</dt>
                        <dd>{currentC.registro.exige_evidencia ? "Obrigatório" : "Opcional"}</dd>
                      </div>
                      <div>
                        <dt className="text-muted-foreground">Validade para validar</dt>
                        <dd>{currentC.registro.exige_validade ? "Obrigatória" : "Opcional"}</dd>
                      </div>
                    </dl>
                    {currentC.usada && (
                      <p className="mt-4 text-sm text-muted-foreground">
                        Requisitos já utilizados ficam preservados. Uma política com requisitos
                        diferentes exige nova competência.
                      </p>
                    )}
                  </Section>
                ) : (
                  currentQ && (
                    <Section
                      title={currentQ.registro.competencia?.nome || "Qualificação"}
                      description={
                        estadoLabels[currentQ.registro.estado] +
                        " · versão " +
                        currentQ.registro.version
                      }
                      actions={
                        <>
                          {currentQ.permissoes.editar && (
                            <ActionButton
                              variant="ghost"
                              onClick={() => setEditor({ tipo: "qualificacao", base: currentQ })}
                            >
                              Editar qualificação enviada
                            </ActionButton>
                          )}
                          {access.revisarOperacao &&
                            currentQ.permissoes.conferir &&
                            !!Object.keys(
                              proximasDecisoes(
                                currentQ.registro.estado,
                                currentQ.permissoes.validar,
                              ),
                            ).length && (
                              <ActionButton
                                onClick={() => setEditor({ tipo: "decisao", base: currentQ })}
                              >
                                Conferir qualificação
                              </ActionButton>
                            )}
                        </>
                      }
                    >
                      <dl className="grid gap-3 text-sm">
                        <div>
                          <dt className="text-muted-foreground">Pessoa</dt>
                          <dd className="break-words">
                            {currentQ.registro.pessoa?.nome || "Identificação não disponível"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Emissor</dt>
                          <dd className="break-words">{currentQ.registro.emissor}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Conclusão</dt>
                          <dd>{civil(currentQ.registro.conclusao)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Validade declarada</dt>
                          <dd>{civil(currentQ.registro.validade)}</dd>
                        </div>
                        {currentQ.registro.motivo && (
                          <div>
                            <dt className="text-muted-foreground">Motivo registrado</dt>
                            <dd className="whitespace-pre-wrap break-words">
                              {currentQ.registro.motivo}
                            </dd>
                          </div>
                        )}
                      </dl>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {currentQ.registro.pessoa && onOpenPessoa && (
                          <ActionButton
                            variant="ghost"
                            onClick={() => onOpenPessoa(currentQ.registro.pessoa_id)}
                          >
                            Abrir cadastro da pessoa
                          </ActionButton>
                        )}
                        {currentQ.registro.competencia && (
                          <ActionButton
                            variant="ghost"
                            onClick={() =>
                              onSearch({
                                area: "competencias",
                                competencia: currentQ.registro.competencia_id,
                                qualificacao: "",
                                busca: "",
                                pagina: 0,
                                arquivadas: !currentQ.registro.competencia?.ativa,
                                pessoaFiltro: "",
                                estado: "",
                              })
                            }
                          >
                            Abrir competência
                          </ActionButton>
                        )}
                      </div>
                      {(!currentQ.registro.pessoa?.ativa ||
                        !currentQ.registro.competencia?.ativa) && (
                        <p className="mt-3 text-sm text-muted-foreground">
                          Pessoa ou competência arquivada. O registro histórico foi preservado.
                        </p>
                      )}
                      <div className="my-4 space-y-2 rounded border border-border p-3">
                        <label className="grid gap-1 text-sm">
                          Consultar situação na data
                          <input
                            className={fieldClass}
                            type="date"
                            value={date}
                            onChange={(e) => setDate(e.target.value)}
                          />
                        </label>
                        {date && (
                          <p role="status" className="text-sm">
                            {situacaoNaData(
                              currentQ.registro.estado,
                              currentQ.registro.conclusao,
                              currentQ.registro.validade,
                              date,
                            )}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Esta conferência trata dos requisitos cadastrados. A alocação depende
                          também do serviço e das demais condições aplicáveis.
                        </p>
                      </div>
                      <RecordFiles
                        pai={{
                          organization_id: orgId,
                          pessoa_id: null,
                          acao_id: null,
                          qualificacao_id: currentQ.registro.id,
                        }}
                        readOnly={["validada", "revogada"].includes(currentQ.registro.estado)}
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
        <QualificationForm
          orgId={orgId}
          editor={editor}
          pessoaId={access.pessoaId}
          execute={execute}
          compare={compare}
          onClose={() => setEditor(null)}
          onDenied={deny}
        />
      )}
    </div>
  );
}
