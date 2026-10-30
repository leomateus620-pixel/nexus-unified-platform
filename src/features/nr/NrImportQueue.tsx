import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import type { Norma } from "./domain";
import { importQueuePlan, type ImportQueuePlan } from "./import-queue.schemas";
import {
  nrImportFilaPreparar,
  nrImportFilaStaging,
  nrImportFilaComandar,
  nrImportFilaConsultar,
} from "./import-queue.functions";

const size = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;
const message = (error: unknown) =>
  error instanceof Error ? error.message : "Não foi possível concluir a etapa.";
const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number" ? String(value) : "—";
const stateLabel = (value: unknown) => text(value).replaceAll("_", " ");
type Preview = { plan: ImportQueuePlan; hash: string; name: string; bytes: number };
export function NrImportQueue({
  org,
  norma,
  onInspect,
}: {
  org: string;
  norma: Norma;
  onInspect: (id: string) => void;
}) {
  const consult = useServerFn(nrImportFilaConsultar),
    prepare = useServerFn(nrImportFilaPreparar),
    stage = useServerFn(nrImportFilaStaging),
    command = useServerFn(nrImportFilaComandar);
  const qc = useQueryClient();
  const [preview, setPreview] = useState<Preview | null>(null),
    [selected, setSelected] = useState(""),
    [page, setPage] = useState(0),
    [busy, setBusy] = useState(false),
    [confirmed, setConfirmed] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const generation = useRef({ id: 0 });
  useEffect(() => {
    const counter = generation.current;
    counter.id++;
    return () => {
      counter.id++;
    };
  }, [org, norma]);
  const query = useQuery({
    queryKey: ["nr", org, norma, "fila-importacao", selected, page],
    queryFn: () =>
      consult({
        data: { organization_id: org, ...(selected ? { id: selected } : {}), pagina: page },
      }),
    refetchInterval: 5000,
  });
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["nr", org, norma, "fila-importacao"] });
  };
  async function readFile(file: File | undefined) {
    if (!file) return;
    const current = generation.current.id;
    setError("");
    setPreview(null);
    setNotice("");
    try {
      if (file.size > 20 * 1024 * 1024)
        throw new Error(
          "O manifesto de metadados deve ter até 20 MiB. Binários usam o fluxo de arquivos, separadamente.",
        );
      const raw = await file.arrayBuffer();
      const parsed = importQueuePlan.safeParse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(raw)),
      );
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        throw new Error(
          `${issue?.path.join(".") || "Manifesto"}: ${issue?.message || "Estrutura inválida."}`,
        );
      }
      if (parsed.data.organization_id && parsed.data.organization_id !== org)
        throw new Error(
          "O manifesto declara outra organização. Confira o destino antes de importar.",
        );
      if (parsed.data.itens.some((item) => size(item) > 1400000))
        throw new Error(
          "Um item ultrapassa 1,4 MB de metadados. Divida seu conteúdo preservando a identidade antes de importar.",
        );
      const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", raw))]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      if (generation.current.id === current)
        setPreview({ plan: parsed.data, hash, name: file.name, bytes: file.size });
    } catch (err) {
      if (generation.current.id === current) setError(message(err));
    }
  }
  async function send() {
    if (!preview || busy) return;
    const current = generation.current.id;
    const alive = () => generation.current.id === current;
    setBusy(true);
    setError("");
    setNotice("");
    setConfirmed(0);
    try {
      const { plan, hash } = preview;
      const fila = await prepare({
        data: {
          organization_id: org,
          norma,
          origem: plan.origem,
          chave: hash,
          inicio: plan.snapshot_inicio,
          fim: plan.snapshot_fim,
          total: plan.itens.length,
          manifesto: { ...plan.manifesto, arquivo_manifesto_sha256: hash, formato: plan.format },
        },
      });
      if (!alive()) return;
      setSelected(fila.id);
      setPage(0);
      if (fila.estado !== "preparando") {
        setNotice(
          "Este manifesto já possui uma fila persistida. Seu estado foi recuperado sem duplicar os itens.",
        );
        setPreview(null);
        await refresh();
        return;
      }
      let batch: ImportQueuePlan["itens"] = [];
      const transfer = async () => {
        if (!alive())
          throw new Error(
            "Contexto alterado; o staging confirmado permanece disponível para retomada.",
          );
        const result = await stage({
          data: { organization_id: org, fila_id: fila.id, itens: batch },
        });
        if (alive()) setConfirmed(result.recebidos);
        batch = [];
      };
      for (const item of plan.itens) {
        if (batch.length === 25 || size([...batch, item]) > 1400000) await transfer();
        batch.push(item);
      }
      if (batch.length) await transfer();
      if (!alive()) return;
      setPreview(null);
      setNotice(
        "Staging privado confirmado. Confira a fila e inicie o processamento quando estiver pronto.",
      );
      await refresh();
    } catch (err) {
      if (alive())
        setError(
          `${message(err)} As etapas já confirmadas permanecem persistidas; reenvie o mesmo manifesto para retomá-las.`,
        );
    } finally {
      if (alive()) setBusy(false);
    }
  }
  async function act(acao: "iniciar" | "pausar" | "retomar" | "cancelar") {
    if (busy || !selected) return;
    if (
      acao === "cancelar" &&
      !window.confirm(
        "Cancelar os próximos itens desta fila? O staging, os registros já importados e suas evidências serão preservados.",
      )
    )
      return;
    const current = generation.current.id;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await command({ data: { organization_id: org, fila_id: selected, acao } });
      if (generation.current.id === current) {
        setNotice("Comando confirmado no servidor.");
        await refresh();
      }
    } catch (err) {
      if (generation.current.id === current) setError(message(err));
    } finally {
      if (generation.current.id === current) setBusy(false);
    }
  }
  const result = query.data,
    fila = result?.fila,
    rows = result?.rows || [],
    pages = Math.max(1, Math.ceil((result?.total || 0) / 25));
  return (
    <section className="nr-panel my-5" aria-label="Execução de importações">
      <h2 className="text-xl font-semibold">Importar e retomar lotes</h2>
      <p className="mt-2 text-sm">
        Receba um manifesto estruturado, confira seu destino e transfira os metadados para staging
        privado. A execução usa checkpoints no banco e continua após fechar esta aba. Originais são
        transferidos e verificados no fluxo de arquivos; links do manifesto não comprovam seus
        bytes.
      </p>
      <details className="my-3">
        <summary className="cursor-pointer py-2 font-medium">
          Formato e decisões de correspondência
        </summary>
        <p className="text-sm">
          Formato nexus-nr-import-plan-v1: origem estável, janela de captura, manifesto e itens
          numerados na ordem de dependências. Cada item contém tipo, ID externo, payload, destino
          explícito, hash informado da origem e data de captura. Dependências usam tipo e ID
          externo. O staging recebe um hash independente no banco. A origem nunca executa código.
          Reimportações preservam edições Nexus; conflitos exigem conciliação e não são sobrescritos
          por “retomar”.
        </p>
      </details>
      <label className="block my-3 text-sm font-medium">
        Manifesto JSON de metadados (até 20 MiB)
        <input
          className="block mt-2 max-w-full min-h-11"
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(event) => void readFile(event.target.files?.[0])}
        />
      </label>
      {preview && (
        <div className="border rounded-xl p-4 my-3 space-y-3">
          <p>
            <strong>{preview.name}</strong> · {preview.bytes.toLocaleString("pt-BR")} bytes ·{" "}
            {preview.plan.itens.length} itens
          </p>
          <p className="break-all">Origem: {preview.plan.origem}</p>
          <p className="text-sm">
            Destino: organização ativa · {norma}. A seleção de cliente/unidade do painel não altera
            as correspondências explícitas deste manifesto.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="text-left py-2">
                Primeiros 25 de {preview.plan.itens.length} mapeamentos declarados
              </caption>
              <thead>
                <tr>
                  <th className="text-left p-2">Origem</th>
                  <th className="text-left p-2">Destino</th>
                </tr>
              </thead>
              <tbody>
                {preview.plan.itens.slice(0, 25).map((item) => (
                  <tr key={item.sequencia}>
                    <td className="p-2 break-all">
                      {item.tipo} · {item.externo_id}
                    </td>
                    <td className="p-2">
                      {item.destino.entidade} ·{" "}
                      {text(
                        item.destino.registro["titulo"] ??
                          item.destino.registro["nome"] ??
                          item.destino.registro["razao_social"],
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <ActionButton disabled={busy} onClick={() => void send()}>
            Confirmar destino e enviar para staging privado
          </ActionButton>
          <button className="min-h-11 px-3" disabled={busy} onClick={() => setPreview(null)}>
            Descartar prévia
          </button>
        </div>
      )}
      {busy && (
        <p role="status">
          Confirmando etapas…{" "}
          {confirmed > 0
            ? `${confirmed} itens recebidos e persistidos.`
            : "Aguardando confirmação do servidor."}
        </p>
      )}
      {error && (
        <p role="alert" className="text-red-800 my-3">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="my-3 text-emerald-900">
          {notice}
        </p>
      )}
      {query.isPending ? (
        <LoadingState label="Consultando filas persistidas…" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <p className="my-3 text-sm">
            {result?.agendador_ativo
              ? "Agendador ativo: processamento em lotes limitados, sem depender desta aba."
              : "Agendador não configurado: o staging permanece preservado; a execução automática está indisponível."}
          </p>
          {fila && (
            <div className="my-3 space-y-3">
              <button
                className="min-h-11 underline"
                onClick={() => {
                  setSelected("");
                  setPage(0);
                }}
              >
                Todas as filas
              </button>
              <p className="break-all">
                Fila {fila.id} · {stateLabel(fila.estado)}
              </p>
              <p>
                {result?.recebidos ?? 0}/{fila.total} recebidos · {result?.processados ?? 0}{" "}
                processados · {result?.erros ?? 0} erros
              </p>
              <div className="flex gap-2 flex-wrap">
                {fila.estado === "preparando" && (
                  <ActionButton
                    disabled={busy || !result?.agendador_ativo || result.recebidos !== fila.total}
                    onClick={() => void act("iniciar")}
                  >
                    Iniciar processamento
                  </ActionButton>
                )}
                {["fila", "processando"].includes(fila.estado) && (
                  <ActionButton disabled={busy} onClick={() => void act("pausar")}>
                    Pausar próximos itens
                  </ActionButton>
                )}
                {["pausado", "com_pendencias"].includes(fila.estado) && (
                  <ActionButton
                    disabled={busy || !result?.agendador_ativo}
                    onClick={() => void act("retomar")}
                  >
                    Retomar itens com erro
                  </ActionButton>
                )}
                {!["concluido", "com_pendencias", "cancelado"].includes(fila.estado) && (
                  <button
                    className="min-h-11 px-3 border rounded-lg"
                    disabled={busy}
                    onClick={() => void act("cancelar")}
                  >
                    Cancelar próximos itens
                  </button>
                )}
                <button className="min-h-11 underline" onClick={() => onInspect(fila.lote_id)}>
                  Abrir conciliação do lote
                </button>
              </div>
            </div>
          )}
          {rows.length === 0 ? (
            <p className="p-4 border rounded-xl">Nenhuma fila recebida neste contexto.</p>
          ) : (
            <ul className="space-y-2">
              {rows.map((row, index) => (
                <li key={text(row["id"]) || index} className="border rounded-xl p-3 min-w-0">
                  <p className="break-all">
                    {fila
                      ? `${text(row["sequencia"])} · ${text(row["tipo"])} · ${text(row["externo_id"])}`
                      : text(row["origem"])}
                  </p>
                  <p className="text-sm">{stateLabel(row["resultado"] ?? row["estado"])}</p>
                  {Boolean(row["motivo"]) && (
                    <p className="text-sm break-words">{text(row["motivo"])}</p>
                  )}
                  {!fila && (
                    <button
                      className="min-h-11 underline"
                      onClick={() => {
                        setSelected(text(row["id"]));
                        setPage(0);
                      }}
                    >
                      Abrir fila
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <nav aria-label="Paginação da fila" className="flex flex-wrap items-center gap-3 my-3">
            <span>
              Página {page + 1} de {pages}
            </span>
            <button
              className="min-h-11 px-2"
              disabled={page === 0 || busy}
              onClick={() => setPage((value) => value - 1)}
            >
              Anterior
            </button>
            <button
              className="min-h-11 px-2"
              disabled={page + 1 >= pages || busy}
              onClick={() => setPage((value) => value + 1)}
            >
              Próxima
            </button>
          </nav>
        </>
      )}
    </section>
  );
}
