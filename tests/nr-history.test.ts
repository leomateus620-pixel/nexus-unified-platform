import { describe, expect, it } from "vitest";
import {
  nrEventDetailInput,
  nrHistoryId,
  nrHistoryPage,
  nrHistoryDetail,
  nrRecordHistoryInput,
  nrRevisionDetailInput,
} from "../src/features/nr/history.schemas";
const org = "00000000-0000-4000-8000-000000000001",
  record = "00000000-0000-4000-8000-000000000002",
  revision = "00000000-0000-4000-8000-000000000003";
describe("histórico NR sob demanda", () => {
  it("preserva bigint completo por string e não aceita números JS imprecisos", () => {
    expect(nrHistoryId.parse("9223372036854775807")).toBe("9223372036854775807");
    expect(nrHistoryId.parse(123)).toBe("123");
    for (const value of [
      "9223372036854775808",
      "0",
      "-1",
      "1.2",
      "not an id",
      record,
      Number.MAX_SAFE_INTEGER + 1,
    ])
      expect(nrHistoryId.safeParse(value).success).toBe(false);
  });
  it("distingue identidade bigint do evento e UUID do registro/revisão", () => {
    expect(
      nrEventDetailInput.safeParse({ organization_id: org, norma: "NR33", evento_id: "42" })
        .success,
    ).toBe(true);
    expect(
      nrEventDetailInput.safeParse({ organization_id: org, norma: "NR33", evento_id: record })
        .success,
    ).toBe(false);
    expect(
      nrRevisionDetailInput.safeParse({
        organization_id: org,
        norma: "NR33",
        recurso: "documentos",
        registro_id: record,
        revisao_id: revision,
      }).success,
    ).toBe(true);
    expect(
      nrRevisionDetailInput.safeParse({
        organization_id: org,
        norma: "NR33",
        recurso: "locais",
        registro_id: record,
        revisao_id: revision,
      }).success,
    ).toBe(false);
  });
  it("limita páginas e não aceita contexto de papel informado pelo cliente", () => {
    const query = { organization_id: org, norma: "NR35", recurso: "locais", registro_id: record };
    expect(nrRecordHistoryInput.parse(query).limite).toBe(25);
    for (const patch of [{ pagina: -1 }, { limite: 101 }, { role: "admin" }, { registro_id: "42" }])
      expect(nrRecordHistoryInput.safeParse({ ...query, ...patch }).success).toBe(false);
  });
  it("listas aceitam metadados e recusam blobs completos para impedir regressão de carregamento", () => {
    const page = {
      rows: [
        {
          id: "9223372036854775807",
          comando: "salvar",
          created_at: "2026-10-30T12:00:00Z",
          motivo_resumido: true,
        },
      ],
      total: 1,
      pagina: 0,
      limite: 25,
    };
    expect(nrHistoryPage.parse(page).rows[0]?.["id"]).toBe("9223372036854775807");
    for (const key of ["antes", "depois", "conteudo", "snapshot", "dados"])
      expect(
        nrHistoryPage.safeParse({
          ...page,
          rows: [{ ...page.rows[0], [key]: { body: "full payload" } }],
        }).success,
      ).toBe(false);
  });
  it("consulta unitária não aplica o orçamento de um formulário a snapshots retidos", () => {
    const retained = { id: "42", antes: { texto: "a".repeat(2_000_100) }, depois: null };
    expect(nrHistoryDetail.parse(retained)["antes"]).toEqual(retained.antes);
  });
});
