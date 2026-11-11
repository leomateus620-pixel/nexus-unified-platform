import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ArrowRight, Plus, Search } from "lucide-react";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { useCommandKey } from "@/features/operacao/components";
import { nrColetaContexto, nrColetaIniciar } from "./coleta.functions";
import { nrExecutar } from "./nr.functions";
import type { Norma, NrContexto, NrRecord } from "./domain";
import "./field-collection.css";

export type FieldScope = { org: string; cliente: string; unidade: string; norma: Norma };

export function NrFieldStart({
  scope,
  user,
  contexto,
  initialLocal,
  source,
  reinspecao = false,
  onOpen,
  onClose,
}: {
  scope: FieldScope;
  user: string;
  contexto: NrContexto;
  initialLocal?: string;
  source?: NrRecord;
  reinspecao?: boolean;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const consult = useServerFn(nrColetaContexto);
  const start = useServerFn(nrColetaIniciar);
  const execute = useServerFn(nrExecutar);
  const keyFor = useCommandKey();
  const lock = useRef(false);
  const [local, setLocal] = useState(initialLocal ?? "");
  const [term, setTerm] = useState("");
  const [page, setPage] = useState(0);
  const [model, setModel] = useState("");
  const [dual, setDual] = useState(false);
  const [newLocal, setNewLocal] = useState(false);
  const [tag, setTag] = useState("");
  const [title, setTitle] = useState("");
  const [family, setFamily] = useState(scope.norma === "NR35" ? "telhado_laje" : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const list = useQuery({
    queryKey: ["nr", scope.org, user, "campo-locais", scope, term, page],
    enabled: !local && !newLocal,
    queryFn: ({ signal }) => consult({ data: { ...scope, busca: term, pagina: page }, signal }),
    retry: false,
  });
  const detail = useQuery({
    queryKey: ["nr", scope.org, user, "campo-local", scope, local],
    enabled: !!local,
    queryFn: ({ signal }) => consult({ data: { ...scope, local }, signal }),
    retry: false,
  });
  const duplicate = useQuery({
    queryKey: ["nr", scope.org, user, "campo-tag", scope, tag],
    enabled: newLocal && tag.trim().length > 0,
    queryFn: ({ signal }) => consult({ data: { ...scope, busca: tag.trim() }, signal }),
    retry: false,
  });
  const selected = detail.data?.locais[0];
  const models = (detail.data?.modelos ?? []).filter((row) => !dual || row.normas.length === 2);
  const chosen =
    models.find((row) => row.id === model) ?? (models.length === 1 ? models[0] : undefined);
  const pilot = !!detail.data?.piloto_altura && !models.length;
  const sameTag = duplicate.data?.locais.find(
    (row) => row.tag.trim().toLowerCase() === tag.trim().toLowerCase(),
  );

  async function run(action: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Não foi possível confirmar a operação."));
    } finally {
      setBusy(false);
      lock.current = false;
    }
  }

  return (
    <section className="nr-field-entry nr-panel" aria-label="Iniciar levantamento">
      <header className="nr-panel-header">
        <div>
          <p className="nr-eyebrow">Coleta de campo</p>
          <h2>
            {reinspecao
              ? "Iniciar reinspeção"
              : source
                ? "Nova revisão da coleta"
                : "Iniciar levantamento"}
          </h2>
        </div>
        <ActionButton variant="ghost" disabled={busy} onClick={onClose}>
          Voltar
        </ActionButton>
      </header>
      <p className="nr-muted">
        {contexto.unidades.find((unit) => unit.id === scope.unidade)?.nome}
      </p>
      {error && <ErrorState error={error} />}
      {!local && !newLocal && (
        <>
          <label className="nr-field-search">
            <Search size={17} />
            <span className="sr-only">Buscar local por TAG, nome ou alias</span>
            <input
              type="search"
              value={term}
              maxLength={120}
              placeholder="Buscar por TAG, nome ou alias"
              onChange={(e) => {
                setTerm(e.target.value);
                setPage(0);
              }}
            />
          </label>
          {list.isPending && <LoadingState label="Buscando locais da unidade…" />}
          {list.isError && <ErrorState error={list.error} onRetry={() => list.refetch()} />}
          {list.data && !list.data.locais.length && (
            <p>
              Nenhum local encontrado neste escopo. Confira o cadastro da unidade ou cadastre uma
              área.
            </p>
          )}
          <ul className="nr-field-choices">
            {list.data?.locais.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => {
                    setLocal(item.id);
                    setModel("");
                    setDual(false);
                  }}
                >
                  <span>
                    <b>{item.tag}</b> {item.titulo}
                    <small>
                      {item.familia || "Família por confirmar"}
                      {item.rascunho_id ? " · Rascunho disponível" : ""}
                    </small>
                  </span>
                  <ArrowRight size={16} />
                </button>
              </li>
            ))}
          </ul>
          {!!list.data && list.data.total > 25 && (
            <div className="nr-field-actions">
              <ActionButton variant="ghost" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Anterior
              </ActionButton>
              <span>Página {page + 1}</span>
              <ActionButton
                variant="ghost"
                disabled={(page + 1) * 25 >= list.data.total}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </ActionButton>
            </div>
          )}
          {contexto.permissoes.cadastrar && (
            <ActionButton variant="ghost" onClick={() => setNewLocal(true)}>
              <Plus size={16} /> Cadastrar novo local
            </ActionButton>
          )}
        </>
      )}
      {newLocal && !local && (
        <div className="nr-field-form">
          <p>
            Fotografe a placa e a vista geral no roteiro. Você pode registrar a identificação como
            pendente.
          </p>
          <label>
            TAG
            <input value={tag} maxLength={80} onChange={(e) => setTag(e.target.value)} />
          </label>
          <label>
            Nome do local
            <input value={title} maxLength={240} onChange={(e) => setTitle(e.target.value)} />
          </label>
          {scope.norma === "NR35" ? (
            <label>
              Tipo de área
              <select value={family} onChange={(e) => setFamily(e.target.value)}>
                <option value="telhado_laje">Telhado ou laje</option>
                <option value="">Outro tipo de área</option>
              </select>
            </label>
          ) : (
            <label>
              Família
              <input
                value={family}
                maxLength={120}
                onChange={(e) => setFamily(e.target.value)}
                placeholder="Informe a família do espaço"
              />
            </label>
          )}
          {sameTag && (
            <p role="status">
              TAG já cadastrada.{" "}
              <button type="button" onClick={() => setLocal(sameTag.id)}>
                Usar {sameTag.tag} · {sameTag.titulo}
              </button>
            </p>
          )}
          {duplicate.isError && (
            <ErrorState error={duplicate.error} onRetry={() => duplicate.refetch()} />
          )}
          <div className="nr-field-actions">
            <ActionButton variant="ghost" disabled={busy} onClick={() => setNewLocal(false)}>
              Buscar local existente
            </ActionButton>
            <ActionButton
              disabled={
                busy ||
                duplicate.isPending ||
                duplicate.isError ||
                !!sameTag ||
                !tag.trim() ||
                title.trim().length < 2
              }
              onClick={() =>
                void run(async () => {
                  const input = {
                    organization_id: scope.org,
                    norma: scope.norma,
                    recurso: "locais" as const,
                    comando: "salvar" as const,
                    dados: {
                      cliente_id: scope.cliente,
                      unidade_id: scope.unidade,
                      normas: [scope.norma],
                      tag: tag.trim(),
                      titulo: title.trim(),
                      tipo: scope.norma === "NR35" ? "ALTURA" : "EC",
                      familia: family.trim(),
                      dados: { identificacao_verificada: false },
                    },
                  };
                  const { registro } = await execute({ data: { ...input, chave: keyFor(input) } });
                  setLocal(registro.id);
                  setNewLocal(false);
                })
              }
            >
              {busy ? "Salvando…" : "Salvar local e escolher roteiro"}
            </ActionButton>
          </div>
        </div>
      )}
      {local && detail.isPending && <LoadingState label="Conferindo o local e os roteiros…" />}
      {local && detail.isError && (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      )}
      {selected && (
        <div className="nr-field-form">
          <h3>
            {selected.tag} · {selected.titulo}
          </h3>
          <p>{selected.familia || "Família por confirmar"}</p>
          {!source && (
            <ActionButton variant="ghost" disabled={busy} onClick={() => setLocal("")}>
              Escolher outro local
            </ActionButton>
          )}
          {selected.rascunho_id && selected.rascunho_id !== source?.id ? (
            <ActionButton onClick={() => onOpen(selected.rascunho_id!)}>
              Retomar levantamento
            </ActionButton>
          ) : (
            <>
              {selected.normas.length === 2 && (
                <label className="nr-field-check">
                  <input
                    type="checkbox"
                    checked={dual}
                    disabled={busy}
                    onChange={(e) => setDual(e.target.checked)}
                  />{" "}
                  Coletar NR-33 e NR-35 no mesmo levantamento
                </label>
              )}
              {!!models.length && (
                <label>
                  Roteiro do local
                  <select
                    disabled={busy}
                    value={chosen?.id ?? ""}
                    onChange={(e) => setModel(e.target.value)}
                  >
                    <option value="">Selecione a versão</option>
                    {models.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.titulo} ·{" "}
                        {item.numero ? `v${item.numero}` : "versão fixada ao iniciar"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {pilot && (
                <p>
                  <b>Telhado ou laje · versão 1</b>
                  <br />
                  Roteiro de observação de campo.
                </p>
              )}
              {!models.length && !pilot && (
                <p role="status">
                  A unidade ainda não tem um roteiro estruturado compatível com a família e o escopo
                  escolhidos. Confira o cadastro e a biblioteca de roteiros.
                </p>
              )}
              {reinspecao && (
                <p>
                  A nova coleta mantém o vínculo com o ativo e a origem aprovada. Preencha as
                  observações da nova visita.
                </p>
              )}
              {source && !reinspecao && (
                <p>
                  As respostas só serão copiadas quando a versão escolhida corresponder aos campos
                  da origem. O registro anterior ficará disponível.
                </p>
              )}
              <ActionButton
                disabled={busy || (!chosen && !pilot)}
                onClick={() =>
                  void run(async () => {
                    const input = {
                      ...scope,
                      local,
                      modelo: chosen?.id ?? null,
                      modeloVersion: chosen?.version ?? null,
                      duplo: dual,
                      origem: source?.id ?? null,
                      reinspecao,
                    };
                    const response = await start({ data: { ...input, chave: keyFor(input) } });
                    onOpen(response.id);
                  })
                }
              >
                {busy ? "Confirmando…" : "Abrir roteiro"} <ArrowRight size={17} />
              </ActionButton>
            </>
          )}
        </div>
      )}
    </section>
  );
}
