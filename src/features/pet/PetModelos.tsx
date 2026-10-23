import { useState } from "react";
import { ActionButton } from "@/components/nexus/Page";
import { OperationalDialog } from "@/features/operacao/components";
import { optionName, petDate, type PetExecute, type PetOpcoes } from "./ui-types";
import { PetField } from "./PetEditor";
import { PetStatus } from "./ExecucaoWorkspace";
import type { Json } from "./schemas";

export function PetModelos({
  options,
  onCommand,
  busy,
  canReview,
  commandError,
}: {
  options: PetOpcoes;
  onCommand: PetExecute;
  busy: boolean;
  canReview: boolean;
  commandError?: string | undefined;
}) {
  const [open, setOpen] = useState(false),
    [error, setError] = useState("");
  const [mode, setMode] = useState<"criar" | "aprovar">("criar");
  const [nome, setNome] = useState(""),
    [procedimento, setProcedimento] = useState(""),
    [modelo, setModelo] = useState("");
  const [responsavel, setResponsavel] = useState(""),
    [declaracao, setDeclaracao] = useState("");
  async function submit() {
    setError("");
    if (mode === "aprovar") {
      if (
        await onCommand({
          comando: "aprovar_modelo",
          dados: { modelo_versao_id: modelo, responsavel_id: responsavel, declaracao },
        })
      )
        setOpen(false);
      return;
    }
    try {
      const parsed: Json = JSON.parse(procedimento);
      if (!parsed || Array.isArray(parsed) || typeof parsed !== "object")
        throw new Error("Informe um objeto JSON com os critérios técnicos do procedimento.");
      if (await onCommand({ comando: "salvar_modelo", dados: { nome, procedimento: parsed } }))
        setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Confira o procedimento JSON.");
    }
  }
  return (
    <details className="nx-pet-panel">
      <summary className="min-h-11 cursor-pointer text-sm font-semibold">
        Modelos e critérios técnicos da organização
      </summary>
      <p className="nx-pet-subtitle my-4">
        Cada versão reúne checklist, agentes e limites, qualificações, resgate e condições de
        continuidade. A ativação exige aprovação do responsável técnico designado, identificado em
        sua própria sessão.
      </p>
      <div className="nx-pet-list">
        {options.modelos.map((m) => (
          <article className="nx-pet-card" key={m.id}>
            <div className="nx-pet-card-top">
              <h3>
                {optionName(m)} · versão {String(m["versao"] || "—")}
              </h3>
              <PetStatus value={String(m.estado || "rascunho")} />
            </div>
            <p className="nx-pet-hint">Aprovação: {petDate(m.aprovado_em)}</p>
            {canReview && m.estado === "rascunho" && (
              <ActionButton
                variant="ghost"
                onClick={() => {
                  setModelo(m.id);
                  setMode("aprovar");
                  setOpen(true);
                }}
              >
                Conferir aprovação técnica
              </ActionButton>
            )}
            <details className="nx-pet-accordion mt-3">
              <summary>Consultar critérios desta versão</summary>
              <div>
                <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-xs">
                  {JSON.stringify(m["procedimento"], null, 2)}
                </pre>
              </div>
            </details>
          </article>
        ))}
        {!options.modelos.length && (
          <p className="nx-pet-notice">
            Nenhum modelo configurado. Rascunhos podem ser preparados; conferência, emissão e
            entrada dependem dos critérios aprovados.
          </p>
        )}
      </div>
      <ActionButton
        variant="ghost"
        className="mt-4"
        onClick={() => {
          setMode("criar");
          setOpen(true);
          setError("");
        }}
      >
        Cadastrar modelo técnico em rascunho
      </ActionButton>
      <OperationalDialog
        open={open}
        onOpenChange={setOpen}
        title={
          mode === "criar"
            ? "Cadastrar modelo técnico em rascunho"
            : "Aprovação técnica do procedimento"
        }
      >
        <form
          className="nx-pet space-y-5"
          data-dirty="true"
          aria-busy={busy}
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          {mode === "criar" ? (
            <>
              <PetField label="Nome do modelo">
                <input
                  required
                  minLength={3}
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                />
              </PetField>
              <PetField
                label="Procedimento e critérios versionados (JSON)"
                hint="Definição técnica: itens [{id,rotulo,obrigatorio,permite_na,justificativa_na,evidencia_obrigatoria}], agentes [{agente,unidade,minimo,maximo}], qualificacoes, procedimento_resgate, monitoramento_continuo e permite_prorrogacao. Consulte o contrato antes de publicar."
              >
                <textarea
                  required
                  className="!min-h-72 font-mono !text-xs"
                  spellCheck={false}
                  value={procedimento}
                  onChange={(e) => setProcedimento(e.target.value)}
                />
              </PetField>
              <p className="nx-pet-notice">
                Não há limites ou qualificações presumidos neste editor. Preencha o procedimento
                validado da organização. Salvar cria uma versão em rascunho.
              </p>
            </>
          ) : (
            <>
              <PetField label="Responsável técnico designado">
                <select
                  required
                  value={responsavel}
                  onChange={(e) => setResponsavel(e.target.value)}
                >
                  <option value="">Selecione sua pessoa operacional</option>
                  {options.pessoas.map((p) => (
                    <option key={p.id} value={p.id}>
                      {optionName(p)}
                    </option>
                  ))}
                </select>
              </PetField>
              <PetField
                label="Declaração de aprovação técnica"
                hint="O servidor exige designação vigente, registro profissional e identidade vinculada à sessão atual."
              >
                <textarea
                  required
                  minLength={20}
                  value={declaracao}
                  onChange={(e) => setDeclaracao(e.target.value)}
                />
              </PetField>
              <p className="nx-pet-notice" data-tone="attention">
                A aprovação fixa os critérios desta versão para uso operacional. Confira checklist,
                critérios atmosféricos, qualificações, monitoramento contínuo e resgate antes de
                decidir.
              </p>
            </>
          )}
          {commandError && (
            <p role="alert" className="nx-pet-notice" data-tone="danger">
              {commandError} O preenchimento foi preservado.
            </p>
          )}
          {error && (
            <p role="alert" className="nx-pet-field-error">
              {error}
            </p>
          )}
          <ActionButton type="submit" loading={busy}>
            {mode === "criar"
              ? "Salvar versão em rascunho"
              : "Aprovar versão como responsável técnico"}
          </ActionButton>
        </form>
      </OperationalDialog>
    </details>
  );
}
