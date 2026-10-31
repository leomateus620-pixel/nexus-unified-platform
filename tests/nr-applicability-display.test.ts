import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NrApplicabilityDecisions } from "../src/features/nr/NrApplicabilityDecisions";
import type { NrJson } from "../src/features/nr/domain";

const decision: Record<string, NrJson> = {
  id: "synthetic-decision",
  versao: "synthetic-applicability-v1",
  decisao: "incluir_nr35",
  resultado: "aplicada",
  normas_anteriores: ["NR33"],
  normas_decididas: ["NR33", "NR35"],
  normas_aplicadas: ["NR33", "NR35"],
  justificativa: "A própria pendência trata da documentação do PGSSTA.",
  motivo_resultado: "Recortes conciliados, mantendo o encerramento histórico.",
  externo_id: "synthetic-unit/P41",
  fonte_sha256: "a".repeat(64),
  evidencias: [
    {
      campo: "descricao",
      trecho: "O PPREC e o PGSSTA compartilham a documentação.",
      campo_sha256: "b".repeat(64),
    },
  ],
  aprovacao_profissional: false,
  autoriza_operacao: false,
  created_at: "2026-10-30T20:00:00Z",
};
const render = (value?: NrJson[]) =>
  renderToStaticMarkup(createElement(NrApplicabilityDecisions, { value }));
describe("leitura das decisões documentais de aplicabilidade", () => {
  it("torna justificativa, fonte, versão e evidência consultáveis sem JSON", () => {
    const html = render([decision]);
    for (const text of [
      "Recorte documental atualizado",
      "Normas anteriores",
      "NR-33",
      "NR-35",
      "Versão da conciliação",
      "synthetic-applicability-v1",
      String(decision.justificativa),
      String(decision.externo_id),
      "a".repeat(64),
      "O PPREC e o PGSSTA compartilham a documentação.",
    ])
      expect(html).toContain(text);
    expect(html).not.toContain('"decisao":');
    expect(html).not.toContain("synthetic-decision");
  });
  it("distingue proposta de escopo de decisão não aplicada e preserva campos novos", () => {
    const html = render([
      {
        ...decision,
        resultado: "pendente_divergencia",
        normas_aplicadas: ["NR33"],
        campo_futuro: { nota: "Informação futura preservada" },
      },
    ]);
    expect(html).toContain("Não aplicado · registro divergente");
    expect(html).toContain("Escopo da decisão");
    expect(html).toContain("Normas após a execução");
    expect(html).toContain("Informação futura preservada");
    expect(html).not.toContain("Recorte documental atualizado");
  });
  it("não inventa decisões ausentes e escapa o texto de origem", () => {
    expect(render()).toBe("");
    expect(render([])).toBe("");
    const html = render([{ ...decision, justificativa: "<script>texto da origem</script>" }]);
    expect(html).toContain("&lt;script&gt;texto da origem&lt;/script&gt;");
    expect(html).not.toContain("<script>");
  });
});
