import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { nrArquivoBaixar } from "./files.functions";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { ActionButton } from "@/components/nexus/Page";

import type { ContentBlock, NativeContent } from "./native-content";
export function NrContentEditor({
  value,
  onChange,
  readOnly = false,
  org,
}: {
  value: NativeContent;
  onChange?: (value: NativeContent) => void;
  readOnly?: boolean;
  org?: string | undefined;
}) {
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
                  {block.modo === "vinculado"
                    ? "Vínculo declarado"
                    : block.modo === "snapshot"
                      ? "Snapshot preservado"
                      : "Texto livre"}
                </p>
                <p className="nr-prewrap">
                  {typeof block.valor_snapshot === "object"
                    ? JSON.stringify(block.valor_snapshot, null, 2)
                    : String(block.valor_snapshot ?? block.texto ?? "Valor ainda não capturado")}
                </p>
                {block.motivo_substituicao && (
                  <p className="nr-source">Substituição manual: {block.motivo_substituicao}</p>
                )}
              </div>
            ) : (
              <div className="nr-field-grid">
                <label>
                  Campo de referência *
                  <input
                    value={block.chave ?? ""}
                    required
                    maxLength={200}
                    placeholder="Ex.: local.tag"
                    onChange={(e) => update(block.id, { chave: e.target.value })}
                  />
                </label>
                <label>
                  Natureza do valor
                  <select
                    value={block.modo ?? "snapshot"}
                    onChange={(e) =>
                      update(block.id, {
                        modo: e.target.value as NonNullable<ContentBlock["modo"]>,
                      })
                    }
                  >
                    <option value="snapshot">Snapshot capturado</option>
                    <option value="vinculado">Vínculo declarado</option>
                    <option value="livre">Substituição manual</option>
                  </select>
                </label>
                <label className="nr-wide">
                  Valor preservado nesta revisão
                  <textarea
                    value={
                      typeof block.valor_snapshot === "object"
                        ? JSON.stringify(block.valor_snapshot, null, 2)
                        : String(block.valor_snapshot ?? "")
                    }
                    rows={3}
                    onChange={(e) =>
                      update(block.id, {
                        valor_snapshot: e.target.value,
                        ...(block.modo === "vinculado"
                          ? { modo: "livre" as const, motivo_substituicao: "" }
                          : {}),
                      })
                    }
                  />
                </label>
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
                  A chave documenta a referência. O valor capturado não é atualizado
                  automaticamente; alterações de base exigem nova revisão e conferência.
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
