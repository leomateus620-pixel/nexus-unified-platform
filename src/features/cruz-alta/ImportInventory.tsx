import { useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { caInventory, caImportInventory, type InventoryRow } from "./inventory.functions";
import { caLocalizarOrigem, caPreparar, caPublicar, caVincular } from "./acervo.functions";
import { objects } from "./manifest";
import { cruzAlta } from "./context";
import { describeFile, operationId, transferFile } from "./upload";
import { sha256Nr } from "@/features/nr/files";

export default function ImportInventory({ user, onClose }: { user: string; onClose: () => void }) {
  const saveInventory = useServerFn(caImportInventory),
    inventory = useServerFn(caInventory),
    lookup = useServerFn(caLocalizarOrigem),
    prepare = useServerFn(caPreparar),
    publish = useServerFn(caPublicar),
    link = useServerFn(caVincular);
  const org = { organization_id: cruzAlta.org };
  const q = useQuery({
    queryKey: ["cruz-alta", user, cruzAlta.org, "inventario"],
    queryFn: ({ signal }) => inventory({ data: org, signal }),
    retry: false,
  });
  const [files, setFiles] = useState<File[]>([]),
    [progress, setProgress] = useState(""),
    [report, setReport] = useState<string[]>([]);
  const guard = useRef(false);
  async function reconcile() {
    if (guard.current || !q.data) return;
    guard.current = true;
    setReport([]);
    const lines: string[] = [];
    try {
      const allowed = new Set(
        q.data.filter((row) => row.sha256 && row.size <= 50 * 1024 * 1024).map((row) => row.size),
      );
      const byHash = new Map<string, File>();
      setProgress("Conferindo conteúdo dos arquivos locais…");
      for (const file of files)
        if (allowed.has(file.size))
          byHash.set(await sha256Nr(new Uint8Array(await file.arrayBuffer())), file);
      const documents = new Map<string, InventoryRow[]>();
      for (const row of q.data) {
        const list = documents.get(row.documentKey) ?? [];
        list.push(row);
        documents.set(row.documentKey, list);
      }
      let published = 0,
        existing = 0,
        pending = 0,
        done = 0;
      const physical = new Set<string>(),
        associations = new Set<string>();
      async function process(row: InventoryRow) {
        const photo = row.scope === "evidencia" && row.mime.startsWith("image/");
        if (
          row.status !== "conferido" ||
          !row.sha256 ||
          (!photo && (row.revision === null || !row.date)) ||
          !row.page ||
          row.size > 50 * 1024 * 1024 ||
          (row.scope !== "unidade" && !row.objectKeys.length)
        ) {
          pending++;
          lines.push(
            row.originalName +
              " — " +
              (row.note || "Conferência de metadados ou destino pendente."),
          );
          return;
        }
        const [first, ...others] = row.objectKeys.length ? row.objectKeys : ["unidade"];
        const scope = { ...org, chave: first! };
        const prior = await lookup({
          data: {
            ...scope,
            documento_chave: row.documentKey,
            source_id: row.sourceId,
            sha256: row.sha256,
          },
        });
        const escopo =
          row.scope === "unidade"
            ? "unidade"
            : row.scope === "conjunto"
              ? "conjunto"
              : photo && objects.find((o) => o.id === first)?.kind === "estrutura"
                ? "estrutura"
                : "individual";
        let doc = prior.documento_id;
        if (!prior.revisao_id) {
          const file = byHash.get(row.sha256);
          if (!file) {
            pending++;
            lines.push(row.originalName + " — bytes ausentes na seleção local.");
            return;
          }
          const meta = await describeFile(file, row.originalName);
          const operacao = await operationId([
            cruzAlta.org,
            cruzAlta.unidade,
            row.documentKey,
            row.sourceId,
            row.sha256,
          ]);
          const ticket = await prepare({ data: { ...scope, ...meta, operacao } });
          await transferFile(ticket, file, meta.mime);
          const result = await publish({
            data: {
              ...scope,
              operacao,
              arquivo_id: ticket.arquivo_id,
              titulo: row.title,
              rotulo: row.revision === null ? "Original" : String(row.revision),
              data: row.date,
              escopo,
              categoria:
                escopo === "unidade"
                  ? row.documentKey === "layout-geral-cruz-alta"
                    ? "layout"
                    : "outro"
                  : escopo === "conjunto"
                    ? "conjunto"
                    : row.mime.startsWith("image/")
                      ? "foto"
                      : "individual",
              origem: {
                sistema:
                  row.scope === "unidade" && String(row.revision) === "43"
                    ? "anexo"
                    : "google_drive",
                id: row.sourceId,
                pagina: row.page,
                nota: row.note,
                documento_chave: row.documentKey,
              },
              ...(doc ? { documento_id: doc } : {}),
              ...(prior.vigente_id ? { anterior_id: prior.vigente_id } : {}),
            },
          });
          doc = result.documento_id;
          published++;
        } else existing++;
        if (!doc) throw new Error("Documento lógico ausente na confirmação.");
        for (const key of [first!, ...others]) {
          if (prior.revisao_id || key !== first)
            await link({ data: { ...org, chave: key, documento_id: doc, escopo } });
          associations.add(doc + "/" + key + "/" + escopo);
        }
        physical.add(row.sha256);
      }
      const remaining = [...documents.values()];
      const run = async () => {
        for (let batch = remaining.shift(); batch; batch = remaining.shift()) {
          batch.sort(
            (a, b) =>
              (a.date ?? "").localeCompare(b.date ?? "") ||
              String(a.revision).localeCompare(String(b.revision), "pt-BR", { numeric: true }),
          );
          for (const row of batch) {
            setProgress(
              "Conferindo " + ++done + " de " + q.data!.length + " · " + row.originalName,
            );
            try {
              await process(row);
            } catch (e) {
              pending++;
              lines.push(
                row.originalName +
                  " — " +
                  (e instanceof Error ? e.message : "Falha na confirmação."),
              );
            }
          }
        }
      };
      await Promise.all([run(), run(), run()]);
      lines.unshift(
        physical.size +
          " conteúdos confirmados · " +
          associations.size +
          " vínculos conferidos · " +
          published +
          " revisões publicadas · " +
          existing +
          " revisões já existentes · " +
          pending +
          " pendências.",
      );
    } catch (e) {
      lines.unshift(e instanceof Error ? e.message : "Falha na leitura.");
    } finally {
      guard.current = false;
      setReport(lines);
      setProgress("");
    }
  }
  return (
    <section>
      <h3>Conciliar inventário técnico</h3>
      <p>
        Destino · Três Tentos, Cruz Alta/RS. Cada vínculo usa a revisão, o conteúdo e o objeto
        conferidos no inventário.
      </p>
      {q.data && <p>{q.data.length} fontes registradas.</p>}
      {q.isError && <p role="alert">{q.error.message}</p>}
      <label>
        Inventário conferido (JSON)
        <input
          type="file"
          accept=".json"
          disabled={!!progress}
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setProgress("Registrando inventário…");
            try {
              if (f.size > 2 * 1024 * 1024) throw new Error("O arquivo excede 2 MiB.");
              const result = await saveInventory({ data: { ...org, json: await f.text() } });
              await q.refetch();
              setReport([result.quantidade + " fontes registradas."]);
            } catch (error) {
              setReport([error instanceof Error ? error.message : "Inventário inválido."]);
            } finally {
              setProgress("");
            }
          }}
        />
      </label>
      <label>
        Selecionar pasta de originais
        <input
          type="file"
          multiple
          {...{ webkitdirectory: "" }}
          disabled={!!progress}
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
        />
      </label>
      <div className="ca-actions">
        <button
          className="ca-action"
          disabled={!q.data?.length || !!progress || !files.length}
          onClick={() => void reconcile()}
        >
          Conferir e importar
        </button>
        <button className="ca-action" disabled={!!progress} onClick={onClose}>
          Concluir
        </button>
      </div>
      {progress && <p role="status">{progress}</p>}
      {report.length > 0 && (
        <div aria-live="polite">
          <p>{report[0]}</p>
          <details>
            <summary>Pendências por fonte</summary>
            <ul>
              {report.slice(1).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
        </div>
      )}
    </section>
  );
}
