import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, ShieldCheck } from "lucide-react";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import type { NrSearch } from "@/features/nr/NrWorkspace";
import type { UnitScope } from "@/features/nr/mapa/types";
import { petContextoUnidade } from "./unidade.functions";
import { petExecutar, petListar } from "./pet.functions";
import { PetCommandIntents } from "./command-intents";
import { petInstant, type PetLista, type PetUICommand } from "./ui-types";
import { PetStatus } from "./ExecucaoWorkspace";
import { PetUnitSettings } from "./PetUnitSettings";
import { petExportarUnidade } from "./consulta.functions";
import { petCsv, downloadCsv } from "./csv";
import "./pet.css";
import { NrQrPlates } from "@/features/nr/NrQrPlates";
import { PetUnitPrint } from "./PetUnitPrint";

export function PetUnitPanel({
  scope,
  user,
  localId,
  search,
  onLocal,
  returnTo = "pets",
}: {
  scope: UnitScope;
  user: string;
  localId?: string | undefined;
  search: NrSearch;
  onLocal?: ((id: string) => void) | undefined;
  returnTo?: "pets" | "mapa-3d";
}) {
  return (
    <PetUnitScope
      key={`${scope.organization_id}:${user}:${scope.norma}:${scope.cliente_id}:${scope.unidade_id}:${localId ?? ""}`}
      scope={scope}
      user={user}
      localId={localId}
      search={search}
      onLocal={onLocal}
      returnTo={returnTo}
    />
  );
}
function PetUnitScope({
  scope,
  user,
  localId,
  search,
  onLocal,
  returnTo,
}: Parameters<typeof PetUnitPanel>[0]) {
  const contextFn = useServerFn(petContextoUnidade),
    exportFn = useServerFn(petExportarUnidade),
    listFn = useServerFn(petListar),
    execute = useServerFn(petExecutar);
  const navigate = useNavigate(),
    cache = useQueryClient(),
    lock = useRef(false),
    intents = useRef(new PetCommandIntents());
  const [creating, setCreating] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<Error | null>(null);
  const [activity, setActivity] = useState(""),
    [end, setEnd] = useState(""),
    [model, setModel] = useState(""),
    [os, setOs] = useState(""),
    [confirmed, setConfirmed] = useState(false);
  const [term, setTerm] = useState(""),
    [page, setPage] = useState(0),
    [group, setGroup] = useState<"andamento" | "concluidas">("andamento"),
    [since, setSince] = useState(""),
    [until, setUntil] = useState("");
  const [live, setLive] = useState(false),
    [exporting, setExporting] = useState(false),
    [exportError, setExportError] = useState("");
  const context = useQuery({
    queryKey: [
      "pet",
      scope.organization_id,
      user,
      "contexto-unidade",
      scope.cliente_id,
      scope.unidade_id,
      scope.norma,
      localId,
    ],
    queryFn: ({ signal }) => contextFn({ data: { ...scope, local_id: localId }, signal }),
    retry: false,
  });
  const ctx = context.data;
  const list = useQuery({
    queryKey: [
      "pet",
      scope.organization_id,
      user,
      "por-espaco",
      scope.cliente_id,
      scope.unidade_id,
      scope.norma,
      ctx?.espaco_id,
      localId,
      group,
      term,
      page,
      since,
      until,
    ],
    enabled: !!ctx?.pode_consultar && (!localId || !!ctx.espaco_id),
    queryFn: ({ signal }) =>
      listFn({
        data: {
          organization_id: scope.organization_id,
          filtros: {
            unidade_id: scope.unidade_id,
            contexto_unidade: true,
            ...(localId ? { espaco_id: ctx!.espaco_id! } : {}),
            grupo: group,
            busca: term,
            pagina: page,
            limite: 10,
            ...(since ? { desde: new Date(`${since}T00:00:00-03:00`).toISOString() } : {}),
            ...(until
              ? {
                  ate: new Date(
                    new Date(`${until}T00:00:00-03:00`).getTime() + 86400000,
                  ).toISOString(),
                }
              : {}),
          },
        },
        signal,
      }) as Promise<PetLista>,
    retry: false,
    refetchInterval: live ? 5000 : 30000,
  });
  async function exportCsv() {
    if (exporting || !ctx?.pode_consultar || (localId && !ctx.espaco_id)) return;
    setExporting(true);
    setExportError("");
    try {
      const r = await exportFn({
        data: {
          ...scope,
          filtros: {
            ...(localId ? { espaco_id: ctx.espaco_id! } : {}),
            grupo: group,
            busca: term,
            ...(since ? { desde: new Date(`${since}T00:00:00-03:00`).toISOString() } : {}),
            ...(until
              ? {
                  ate: new Date(
                    new Date(`${until}T00:00:00-03:00`).getTime() + 86400000,
                  ).toISOString(),
                }
              : {}),
          },
        },
      });
      downloadCsv(petCsv(r.registros, r.consultado_em), "PET-historico-unidade.csv");
    } catch (e) {
      setExportError(e instanceof Error ? e.message : "Exportação não concluída.");
    } finally {
      setExporting(false);
    }
  }
  const base = scope.norma === "NR33" ? "/nr-33" : "/nr-35";
  const selected = ctx?.locais.find((l) => l.id === localId);
  async function create() {
    if (lock.current || !ctx?.pode_criar || !localId || !ctx.espaco_id || !confirmed) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      const value: Omit<PetUICommand, "chave"> = {
        comando: "criar_pet",
        dados: {
          cliente_id: scope.cliente_id,
          unidade_id: scope.unidade_id,
          local_id: localId,
          espaco_id: ctx.espaco_id,
          norma: scope.norma,
          os_id: os || null,
          atividade: activity,
          termino_previsto: petInstant(end, "America/Sao_Paulo"),
          timezone: "America/Sao_Paulo",
          modelo_versao_id: model,
        },
      };
      const result = await execute({
        data: {
          organization_id: scope.organization_id,
          comando: { ...value, chave: intents.current.key(value) },
        },
      });
      await cache.invalidateQueries({ queryKey: ["pet", scope.organization_id] });
      intents.current.confirmed(value);
      await navigate({
        to: String(`${base}/pets/${result["pet_id"]}`),
        search: { ...search, local: localId, retorno: returnTo ?? "pets" },
      });
    } catch (e) {
      setError(
        e instanceof Error
          ? e
          : new Error(
              "Não foi possível confirmar a criação. Tente novamente para consultar a mesma intenção.",
            ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (context.isPending)
    return <LoadingState label="Conferindo espaço, atribuições e procedimento…" />;
  if (context.isError)
    return <ErrorState error={context.error} onRetry={() => context.refetch()} />;
  if (!ctx) return null;
  return (
    <section className="nx-pet unit-pet" aria-label="PET do local">
      <h3>
        <ShieldCheck size={18} aria-hidden /> Permissão de Entrada e Trabalho
      </h3>
      <p className="nx-pet-subtitle">
        Espaço confinado · NR-33. Origem de navegação: {scope.norma === "NR33" ? "NR-33" : "NR-35"}.
        Consultar ou salvar rascunho não libera entrada.
      </p>
      {onLocal && (
        <label className="nx-pet-field">
          Local
          <select value={localId ?? ""} onChange={(e) => onLocal(e.target.value)}>
            <option value="">Histórico de toda a unidade</option>
            {ctx.locais.map((l) => (
              <option value={l.id} key={l.id}>
                {l.tag} · {l.titulo}
              </option>
            ))}
          </select>
        </label>
      )}
      {ctx.bloqueio && (
        <p role="note" className="nx-pet-notice">
          {ctx.bloqueio}
        </p>
      )}
      {!ctx.assinatura_configurada && ctx.pode_consultar && (
        <p className="nx-pet-notice">
          Integração não configurada: assinatura certificada. A emissão exige o provedor e originais
          verificáveis; o rascunho permanece disponível conforme sua atribuição.
        </p>
      )}
      {ctx.pode_criar && !creating && (
        <ActionButton onClick={() => setCreating(true)}>
          <Plus size={16} /> Criar PET
        </ActionButton>
      )}
      {creating && (
        <form
          className="unit-pet-form"
          onSubmit={(event) => {
            event.preventDefault();
            void create();
          }}
        >
          <h4>Novo rascunho · {selected?.tag}</h4>
          <p>{selected?.titulo}</p>
          <label className="nx-pet-field">
            Atividade
            <textarea
              required
              minLength={3}
              maxLength={4000}
              value={activity}
              disabled={busy}
              onChange={(e) => setActivity(e.target.value)}
            />
          </label>
          <label className="nx-pet-field">
            Procedimento aprovado
            <select
              required
              value={model}
              disabled={busy}
              onChange={(e) => setModel(e.target.value)}
            >
              <option value="">Selecione a versão aplicável</option>
              {ctx.modelos.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome} · versão {m.versao}
                </option>
              ))}
            </select>
          </label>
          <label className="nx-pet-field">
            Término previsto · horário de Brasília
            <input
              type="datetime-local"
              required
              value={end}
              disabled={busy}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <label className="nx-pet-field">
            Ordem de serviço
            <select value={os} disabled={busy} onChange={(e) => setOs(e.target.value)}>
              <option value="">Sem vínculo com OS</option>
              {ctx.ordens.map((o) => (
                <option value={o.id} key={o.id}>
                  OS {o.numero} · {o.titulo}
                </option>
              ))}
            </select>
          </label>
          <label className="unit-pet-confirm">
            <input
              type="checkbox"
              required
              checked={confirmed}
              disabled={busy}
              onChange={(e) => setConfirmed(e.target.checked)}
            />{" "}
            Conferi a TAG {selected?.tag} e o equipamento no cadastro. A posição ilustrativa no mapa
            não comprova identidade em campo.
          </label>
          {error && (
            <p role="alert" className="nx-pet-notice">
              {error.message}
            </p>
          )}
          <div className="nx-pet-actions">
            <ActionButton type="submit" loading={busy} disabled={!confirmed}>
              Confirmar criação do rascunho
            </ActionButton>
            <ActionButton
              type="button"
              variant="ghost"
              disabled={busy}
              onClick={() => setCreating(false)}
            >
              Voltar
            </ActionButton>
          </div>
        </form>
      )}
      {ctx.pode_consultar && (!localId || !!ctx.espaco_id) && (
        <>
          <div className="nx-pet-actions">
            <button aria-pressed={live} onClick={() => setLive((v) => !v)}>
              {live ? "Ao vivo · atualização em 5 s" : "Acompanhar ao vivo"}
            </button>
            <button disabled={exporting} onClick={() => void exportCsv()}>
              {exporting ? "Preparando CSV…" : "Exportar CSV do filtro"}
            </button>
          </div>
          {exportError && <p role="alert">{exportError}</p>}
          <div className="unit-pet-filters">
            <label className="nx-pet-field">
              Situação
              <select
                value={group}
                onChange={(e) => {
                  setGroup(e.target.value as typeof group);
                  setPage(0);
                }}
              >
                <option value="andamento">Em andamento</option>
                <option value="concluidas">Concluídas e canceladas</option>
              </select>
            </label>
            <label className="nx-pet-field">
              Buscar número, TAG, apelido, atividade ou situação
              <input
                type="search"
                maxLength={120}
                value={term}
                onChange={(e) => {
                  setTerm(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <details>
              <summary>Período de criação</summary>
              <label className="nx-pet-field">
                Desde
                <input
                  type="date"
                  value={since}
                  onChange={(e) => {
                    setSince(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
              <label className="nx-pet-field">
                Até
                <input
                  type="date"
                  value={until}
                  onChange={(e) => {
                    setUntil(e.target.value);
                    setPage(0);
                  }}
                />
              </label>
            </details>
          </div>
          {list.isPending ? (
            <LoadingState />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} />
          ) : (
            <>
              <p role="status">
                {list.data.total}{" "}
                {group === "andamento" ? "em andamento" : "concluída(s) ou cancelada(s)"}
              </p>
              {list.data.registros.map((p) => (
                <article className="unit-pet-record" key={p.id}>
                  <strong>{p.numero}</strong>
                  <PetStatus value={p.estado_documental} />
                  <p>
                    {p.espaco_nome} · {p.atividade}
                  </p>
                  {live && (
                    <p>
                      {p.presentes ?? 0} presença(s) registrada(s) · {p.condicao_operacional} ·
                      consulta {new Date(list.dataUpdatedAt).toLocaleTimeString("pt-BR")}
                    </p>
                  )}
                  <Link
                    className="nr-inline-action"
                    to={String(`${base}/pets/${p.id}`)}
                    search={{
                      ...search,
                      local: p.local_nr_id ?? localId ?? "",
                      retorno: returnTo ?? "pets",
                    }}
                  >
                    {group === "andamento" ? "Continuar PET" : "Consultar PET"}
                  </Link>
                  <Link
                    className="nr-inline-action"
                    to={String(`${base}/pets/${p.id}`)}
                    search={{
                      ...search,
                      local: p.local_nr_id ?? localId ?? "",
                      consulta: true,
                      retorno: returnTo ?? "pets",
                    }}
                  >
                    Somente leitura · gestor
                  </Link>
                  {!p.local_nr_id && <p>Registro legado sem correspondência física confirmada.</p>}
                </article>
              ))}
              {!list.data.total && (
                <EmptyState
                  title={
                    group === "andamento"
                      ? "Nenhuma PET em andamento"
                      : "Nenhuma PET concluída ou cancelada"
                  }
                  hint="As permissões confirmadas ficam neste histórico desde a criação do rascunho."
                />
              )}
              {list.data.total > 10 && (
                <nav className="nx-pet-actions" aria-label="Páginas do histórico">
                  <button disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Anterior
                  </button>
                  <span>Página {page + 1}</span>
                  <button
                    disabled={(page + 1) * 10 >= list.data.total}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Próxima
                  </button>
                </nav>
              )}
            </>
          )}
        </>
      )}
      {onLocal && <PetUnitSettings org={scope.organization_id} user={user} />}
      {onLocal && ctx && (
        <NrQrPlates client={scope.cliente_id} unit={scope.unidade_id} places={ctx.locais} />
      )}
      {onLocal && ctx && <PetUnitPrint scope={scope} models={ctx.modelos} />}
    </section>
  );
}
