import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { nrArquivoBaixar } from "./files.functions";
import { nrDocumentoCampos } from "./document-models.functions";
import { nrDocumentFieldLabels } from "./document-models.schemas";
import {
  capturarCampoDocumento,
  selecionarCampoDocumento,
  substituirCampoDocumento,
} from "./document-fields";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";

import type { ContentBlock, NativeContent } from "./native-content";
import type { Norma } from "./domain";
export function NrContentEditor({
  value,
  onChange,
  readOnly = false,
  org,
  fieldContext,
  modelTemplate = false,
}: {
  value: NativeContent;
  onChange?: (value: NativeContent) => void;
  readOnly?: boolean;
  org?: string | undefined;
  fieldContext?:
    { norma: Norma; clienteId: string; unidadeId: string; localId: string } | undefined;
  modelTemplate?: boolean;
}) {
  const resolveFields = useServerFn(nrDocumentoCampos);
  const [capturing, setCapturing] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState("");
  const contextKey = JSON.stringify([
    org,
    fieldContext?.norma,
    fieldContext?.clienteId,
    fieldContext?.unidadeId,
    fieldContext?.localId,
  ]);
  const live = useRef({ value, contextKey });
  live.current = { value, contextKey };
  const fields = useQuery({
    queryKey: [
      "nr",
      org,
      fieldContext?.norma,
      "documento-campos",
      fieldContext?.clienteId,
      fieldContext?.unidadeId,
      fieldContext?.localId,
    ],
    enabled:
      !readOnly &&
      !modelTemplate &&
      !!org &&
      !!fieldContext?.clienteId &&
      !!fieldContext?.unidadeId &&
      value.blocos.some((b) => b.tipo === "campo"),
    queryFn: ({ signal }) =>
      resolveFields({
        data: {
          organization_id: org ?? "",
          norma: fieldContext?.norma ?? "NR33",
          cliente_id: fieldContext?.clienteId ?? "",
          unidade_id: fieldContext?.unidadeId ?? "",
          local_id: fieldContext?.localId || null,
        },
        signal,
      }),
    retry: false,
  });
  async function capture(block: ContentBlock) {
    const requestedContext = contextKey;
    const requestedBlock = JSON.stringify(block);
    setCapturing(block.id);
    setCaptureError("");
    try {
      const result = await fields.refetch({ throwOnError: true });
      const current = live.current.value.blocos.find((b) => b.id === block.id);
      if (
        !current ||
        live.current.contextKey !== requestedContext ||
        current.chave !== block.chave ||
        JSON.stringify(current) !== requestedBlock
      )
        throw new Error(
          "O contexto ou o preenchimento mudou. Sua edição foi preservada; capture novamente se necessário.",
        );
      const field = result.data?.campos.find((item) => item.chave === block.chave);
      if (!field)
        throw new Error("Campo indisponível neste contexto. Confirme cliente, unidade e local.");
      const captured = capturarCampoDocumento(current, field);
      onChange?.({
        ...live.current.value,
        blocos: live.current.value.blocos.map((b) => (b.id === block.id ? captured : b)),
      });
    } catch (error) {
      setCaptureError(
        error instanceof Error ? error.message : "Não foi possível capturar o campo.",
      );
    } finally {
      setCapturing(null);
    }
  }
  function update(id: string, patch: Partial<ContentBlock>) {
    onChange?.({
      ...value,
      blocos: value["blocos"].map((b) => (b["id"] === id ? { ...b, ...patch } : b)),
    });
  }
  function move(index: number, shift: number) {
    const blocks = [...value["blocos"]];
    const current = blocks[index];
    const other = blocks[index + shift];
    if (!current || !other) return;
    blocks[index] = other;
    blocks[index + shift] = current;
    onChange?.({ ...value, blocos: blocks });
  }
  return (
    <div className="nr-content-editor">
      {captureError && (
        <p role="alert" className="nr-feedback">
          {captureError}
        </p>
      )}
      {!value["blocos"].length && (
        <p className="nr-muted">
          Nenhum bloco de conteúdo. Adicione títulos, texto, tabelas ou referências.
        </p>
      )}
      {value["blocos"].map((block, index) => (
        <section key={block.id} className="nr-content-block">
          {!readOnly && (
            <div className="nr-block-toolbar">
              <strong>
                {index + 1}.{" "}
                {
                  {
                    titulo: "Título",
                    paragrafo: "Parágrafo",
                    tabela: "Tabela",
                    imagem: "Imagem vinculada",
                    referencia: "Referência",
                    campo: "Campo e snapshot",
                  }[block.tipo]
                }
              </strong>
              <div>
                <button
                  type="button"
                  aria-label={`Mover bloco ${index + 1} para cima`}
                  disabled={index === 0}
                  onClick={() => move(index, -1)}
                >
                  <ArrowUp size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`Mover bloco ${index + 1} para baixo`}
                  disabled={index === value["blocos"].length - 1}
                  onClick={() => move(index, 1)}
                >
                  <ArrowDown size={16} />
                </button>
                <button
                  type="button"
                  aria-label={`Remover bloco ${index + 1}`}
                  onClick={() =>
                    onChange?.({
                      ...value,
                      blocos: value["blocos"].filter((b) => b["id"] !== block.id),
                    })
                  }
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          )}
          {block.tipo === "tabela" ? (
            <div className="nr-table-wrap">
              <table>
                <caption className="sr-only">Tabela do bloco {index + 1}</caption>
                <tbody>
                  {(
                    block.linhas ?? [
                      ["", ""],
                      ["", ""],
                    ]
                  ).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci}>
                          {readOnly ? (
                            cell
                          ) : (
                            <input
                              aria-label={`Bloco ${index + 1}, linha ${ri + 1}, coluna ${ci + 1}`}
                              value={cell}
                              maxLength={4000}
                              onChange={(e) => {
                                const lines = (
                                  block.linhas ?? [
                                    ["", ""],
                                    ["", ""],
                                  ]
                                ).map((r) => [...r]);
                                if (!lines[ri]) return;
                                lines[ri][ci] = e.target.value;
                                update(block.id, { linhas: lines });
                              }}
                            />
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
              {!readOnly && (
                <div className="nr-actions">
                  <ActionButton
                    variant="ghost"
                    onClick={() =>
                      update(block.id, {
                        linhas: [
                          ...(block.linhas ?? [["", ""]]),
                          Array((block.linhas?.[0] ?? ["", ""]).length).fill(""),
                        ],
                      })
                    }
                  >
                    Adicionar linha
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    onClick={() =>
                      update(block.id, {
                        linhas: (block.linhas ?? [["", ""]]).map((r) => [...r, ""]),
                      })
                    }
                  >
                    Adicionar coluna
                  </ActionButton>
                </div>
              )}
            </div>
          ) : block.tipo === "campo" ? (
            readOnly ? (
              <div>
                <p className="nr-muted">
                  {block.chave} ·{" "}
                  {modelTemplate && block.modo !== "livre"
                    ? "Campo do modelo · captura ao criar documento"
                    : block.modo === "vinculado"
                      ? "Vínculo com a base · valor desta revisão"
                      : block.modo === "snapshot"
                        ? "Snapshot preservado"
                        : "Texto livre"}
                </p>
                <p className="nr-prewrap">
                  {block.valor_snapshot === null
                    ? "Não informado no cadastro"
                    : typeof block.valor_snapshot === "object"
                      ? JSON.stringify(block.valor_snapshot, null, 2)
                      : String(block.valor_snapshot ?? block.texto ?? "Valor ainda não capturado")}
                </p>
                {block.fonte_snapshot &&
                  typeof block.fonte_snapshot === "object" &&
                  !Array.isArray(block.fonte_snapshot) && (
                    <p className="nr-source">
                      Fonte: {String(block.fonte_snapshot["tipo"] ?? "cadastro")} · versão{" "}
                      {String(block.fonte_snapshot["version"] ?? "não informada")} · hash{" "}
                      <span className="break-all">
                        {String(block.fonte_snapshot["sha256"] ?? "não informado")}
                      </span>
                    </p>
                  )}
                {block.motivo_substituicao && (
                  <p className="nr-source">Substituição manual: {block.motivo_substituicao}</p>
                )}
              </div>
            ) : (
              <div className="nr-field-grid">
                <label>
                  Campo da base *
                  <select
                    value={block.chave ?? ""}
                    required
                    onChange={(e) => {
                      const selected = selecionarCampoDocumento(block, e.target.value);
                      onChange?.({
                        ...value,
                        blocos: value.blocos.map((b) => (b.id === block.id ? selected : b)),
                      });
                    }}
                  >
                    <option value="">Selecione um campo suportado</option>
                    {block.chave && !(block.chave in nrDocumentFieldLabels) && (
                      <option value={block.chave}>{block.chave} · referência preservada</option>
                    )}
                    {Object.entries(nrDocumentFieldLabels).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <p className="nr-muted">
                  {block.modo === "livre"
                    ? "Substituição manual, com justificativa"
                    : block.chave?.startsWith("local.")
                      ? "Vínculo versionado com o local"
                      : "Snapshot de cadastro · sem atualização automática"}
                </p>
                <label className="nr-wide">
                  {modelTemplate
                    ? "Valor a capturar na criação do documento"
                    : "Valor preservado nesta revisão"}
                  <textarea
                    value={
                      typeof block.valor_snapshot === "object"
                        ? JSON.stringify(block.valor_snapshot, null, 2)
                        : String(block.valor_snapshot ?? "")
                    }
                    rows={3}
                    readOnly={modelTemplate || block.modo !== "livre"}
                    onChange={(e) =>
                      update(block.id, substituirCampoDocumento(block, e.target.value))
                    }
                  />
                </label>
                {!modelTemplate && (
                  <div className="nr-actions nr-wide">
                    <ActionButton
                      variant="ghost"
                      loading={capturing === block.id}
                      disabled={
                        !!capturing ||
                        !org ||
                        !fieldContext?.clienteId ||
                        !fieldContext?.unidadeId ||
                        !block.chave ||
                        !(block.chave in nrDocumentFieldLabels)
                      }
                      onClick={() => void capture(block)}
                    >
                      Capturar valor da base
                    </ActionButton>
                    {block.modo !== "livre" && (
                      <ActionButton
                        variant="ghost"
                        disabled={!!capturing || !block.chave}
                        onClick={() =>
                          update(
                            block.id,
                            substituirCampoDocumento(
                              block,
                              typeof block.valor_snapshot === "string"
                                ? block.valor_snapshot
                                : JSON.stringify(block.valor_snapshot ?? ""),
                            ),
                          )
                        }
                      >
                        Substituir manualmente
                      </ActionButton>
                    )}
                  </div>
                )}
                {!modelTemplate &&
                  block.fonte_snapshot &&
                  typeof block.fonte_snapshot === "object" &&
                  !Array.isArray(block.fonte_snapshot) && (
                    <p className="nr-source nr-wide">
                      Captura preservada: {String(block.fonte_snapshot["tipo"] ?? "cadastro")} ·
                      versão {String(block.fonte_snapshot["version"] ?? "não informada")} · hash{" "}
                      <span className="break-all">
                        {String(block.fonte_snapshot["sha256"] ?? "não informado")}
                      </span>
                    </p>
                  )}
                {block.modo === "livre" && (
                  <label className="nr-wide">
                    Motivo da substituição manual *
                    <textarea
                      value={block.motivo_substituicao ?? ""}
                      required
                      minLength={3}
                      rows={2}
                      onChange={(e) => update(block.id, { motivo_substituicao: e.target.value })}
                    />
                  </label>
                )}
                <p className="nr-muted nr-wide">
                  {modelTemplate
                    ? "O modelo guarda a chave. O servidor captura valor, versão e hash do cadastro ao criar o documento. Nenhum dado é inventado para campos vazios."
                    : "A captura consulta a base autorizada e conserva sua versão e hash. Alterações do local geram necessidade de revisão; documentos emitidos preservam seu snapshot."}
                </p>
              </div>
            )
          ) : block.tipo === "imagem" ? (
            <div className="nr-field-grid">
              {readOnly ? (
                <NrContentImage org={org} arquivoId={block.arquivo_id} legenda={block.legenda} />
              ) : (
                <>
                  <label>
                    ID do arquivo verificado
                    <input
                      value={block.arquivo_id ?? ""}
                      placeholder="UUID do original preservado"
                      pattern="[0-9a-fA-F-]{36}"
                      required
                      onChange={(e) => update(block.id, { arquivo_id: e.target.value })}
                    />
                  </label>
                  <label>
                    Legenda
                    <input
                      value={block.legenda ?? ""}
                      maxLength={2000}
                      onChange={(e) => update(block.id, { legenda: e.target.value })}
                    />
                  </label>
                  <p className="nr-muted nr-wide">
                    O vínculo é uma referência ao acervo. A prévia de bytes depende do armazenamento
                    configurado.
                  </p>
                </>
              )}
            </div>
          ) : readOnly ? (
            block.tipo === "titulo" ? (
              <h3>{block.texto}</h3>
            ) : (
              <p className="nr-prewrap">{block.texto}</p>
            )
          ) : (
            <label>
              {block.tipo === "titulo"
                ? "Texto do título"
                : block.tipo === "referencia"
                  ? "Referência e fonte"
                  : "Texto do parágrafo"}
              {block.tipo === "titulo" ? (
                <input
                  value={block.texto ?? ""}
                  maxLength={300}
                  onChange={(e) => update(block.id, { texto: e.target.value })}
                />
              ) : (
                <textarea
                  value={block.texto ?? ""}
                  rows={block.tipo === "referencia" ? 2 : 5}
                  maxLength={20000}
                  onChange={(e) => update(block.id, { texto: e.target.value })}
                />
              )}
            </label>
          )}
        </section>
      ))}
      {!readOnly && (
        <div className="nr-actions" aria-label="Adicionar bloco de conteúdo">
          {(
            [
              ["titulo", "Título"],
              ["paragrafo", "Parágrafo"],
              ["tabela", "Tabela"],
              ["referencia", "Referência"],
              ["imagem", "Imagem"],
              ["campo", "Campo / snapshot"],
            ] as const
          ).map(([tipo, label]) => (
            <ActionButton
              key={tipo}
              variant="ghost"
              onClick={() =>
                onChange?.({
                  ...value,
                  blocos: [
                    ...value["blocos"],
                    {
                      id: crypto.randomUUID(),
                      tipo,
                      texto: "",
                      ...(tipo === "campo"
                        ? { chave: "", modo: "snapshot" as const, valor_snapshot: "" }
                        : {}),
                      ...(tipo === "tabela"
                        ? {
                            linhas: [
                              ["", ""],
                              ["", ""],
                            ],
                          }
                        : {}),
                    },
                  ],
                })
              }
            >
              <Plus size={15} aria-hidden />
              {label}
            </ActionButton>
          ))}
        </div>
      )}
    </div>
  );
}

function NrContentImage({
  org,
  arquivoId,
  legenda,
}: {
  org?: string | undefined;
  arquivoId?: string | undefined;
  legenda?: string | undefined;
}) {
  const load = useServerFn(nrArquivoBaixar);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function show() {
    if (!org || !arquivoId) return;
    setBusy(true);
    setError("");
    try {
      const response = await load({
        data: { organization_id: org, id: arquivoId, visualizar: true },
      });
      if (!response.arquivo.mime.startsWith("image/"))
        throw new Error("O vínculo aponta para um arquivo que não é imagem.");
      setUrl(response.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Imagem indisponível.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <figure className="nr-wide">
      {url ? (
        <img
          src={url}
          alt={legenda || "Evidência vinculada à revisão"}
          referrerPolicy="no-referrer"
          className="max-h-[65vh] max-w-full object-contain"
        />
      ) : (
        <div>
          <p className="nr-muted">Imagem vinculada: {arquivoId || "Arquivo pendente"}</p>
          {org && arquivoId && (
            <ActionButton variant="ghost" loading={busy} onClick={() => void show()}>
              Carregar imagem autorizada
            </ActionButton>
          )}
        </div>
      )}
      {legenda && <figcaption className="nr-muted mt-2">{legenda}</figcaption>}
      {error && (
        <p className="nr-feedback" role="alert">
          {error}
        </p>
      )}
    </figure>
  );
}
