import { describe, expect, it } from "vitest";
import {
  nrImportInspectionInput,
  nrImportInspectionResponse,
} from "../src/features/nr/import-inspection.schemas";

const organization_id = "00000000-0000-4000-8000-000000000001";
const lote_id = "00000000-0000-4000-8000-000000000002";
const item_id = "00000000-0000-4000-8000-000000000003";
describe("private import inspection boundary", () => {
  it("requires an explicit lot before requesting a private item's snapshot", () => {
    expect(nrImportInspectionInput.safeParse({ organization_id, item_id }).success).toBe(false);
    expect(nrImportInspectionInput.parse({ organization_id, lote_id, item_id }).limite).toBe(25);
  });
  it("rejects unbounded pages and unknown item outcomes", () => {
    expect(nrImportInspectionInput.safeParse({ organization_id, limite: 101 }).success).toBe(false);
    expect(nrImportInspectionInput.safeParse({ organization_id, pagina: -1 }).success).toBe(false);
    expect(
      nrImportInspectionInput.safeParse({ organization_id, resultado: "concluido" }).success,
    ).toBe(false);
  });
  it("distinguishes a valid empty list from a malformed response", () => {
    expect(nrImportInspectionResponse.safeParse({}).success).toBe(false);
    expect(nrImportInspectionResponse.parse({ rows: [], total: 0 }).rows).toEqual([]);
  });
  it("preserves complete inert source evidence instead of truncating it to list metadata", () => {
    const item = {
      id: item_id,
      payload: { texto: "<script>untrusted source text</script>" },
      evidencia: { decisao: "sem correspondência" },
    };
    expect(nrImportInspectionResponse.parse({ lote: { id: lote_id }, item }).item).toEqual(item);
  });
});
