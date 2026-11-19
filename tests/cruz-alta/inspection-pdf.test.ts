import assert from "node:assert/strict";
import test from "node:test";
import {
  formatInspectionDate,
  inspectDueStatus,
} from "../../src/features/cruz-alta/inspection-domain";
import { parseInspectionPages } from "../../src/features/cruz-alta/inspection-pdf.server";

const laudo = { kind: "laudo", code: "08", revision: 0 } as const;
const placa = { kind: "placa", code: "57.1", revision: 0 } as const;

test("distingue a data da ART da montagem, da vistoria inicial e do vencimento", () => {
  const result = parseInspectionPages(
    [
      "08 - TELHADO DEMONSTRAÇÃO - LVHF 30M",
      "Inspeção inicial /\ninspetor \n18/07/2026 / registro primário\nPróxima inspeção 18/07/2027 (12 meses após a inspeção inicial)",
      "ART 11111111\nCREA-RS · registrada em 11/07/2026\nRegime   Restrição de movimentação · Documento técnico",
    ],
    laudo,
  );
  assert.deepEqual(result.fields, {
    rt: { value: "2026-07-11", page: 3, label: "Data da RT/ART" },
    inspection: { value: "2026-07-18", page: 2, label: "Inspeção inicial" },
    due: { value: "2027-07-18", page: 2, label: "Próxima inspeção" },
  });
  assert.deepEqual(result.restriction, { page: 3, text: "Restrição de movimentação" });
});

test("lê o código decimal e as datas da placa em linhas distintas", () => {
  const result = parseInspectionPages(
    [
      "LVHF-LAJE-57,1\nPLACA REV. 00 – 19/07/2026\nPRÓXIMA INSPEÇÃO\n18/07/2027\nINSPEÇÃO INICIAL 18/07/2026\nDATA DA MONTAGEM: 14/07/2026\nLIMITES DE USO   Restrição de movimentação\n",
    ],
    placa,
  );
  assert.equal(result.fields.due?.value, "2027-07-18");
  assert.equal(result.fields.installation?.value, "2026-07-14");
  assert.equal(result.fields.rt, undefined);
  assert.equal(result.restriction?.text, "Restrição de movimentação");
  assert.deepEqual(result.issues, []);
});

test("recusa promover campos quando o número completo, a revisão ou as datas divergem", () => {
  const wrongLine = parseInspectionPages(["LVHF-LAJE-57\nPróxima inspeção 18/07/2027"], placa);
  assert.equal(wrongLine.identityMismatch, true);
  assert.deepEqual(wrongLine.fields, {});
  const wrongRev = parseInspectionPages(
    ["LVHF-LAJE-57.1\nPLACA REV. 01\nPróxima inspeção 18/07/2027"],
    placa,
  );
  assert.deepEqual(wrongRev.fields, {});
  assert.equal(wrongRev.issues.length, 1);
  const wrongDates = parseInspectionPages(
    ["Próxima inspeção 18/07/2027\nInspeção inicial 18/07/2026", "Próxima inspeção 31/02/2027"],
    laudo,
  );
  assert.equal(wrongDates.fields.due, undefined);
  assert.equal(wrongDates.fields.inspection?.value, "2026-07-18");
  assert.equal(wrongDates.issues.length, 1);
});

test("só usa datas rotuladas e nunca estima a inspeção", () => {
  assert.deepEqual(
    parseInspectionPages(["Rev. 00 · 19/07/2026\nA próxima inspeção ocorrerá em 12 meses"], laudo)
      .fields,
    {},
  );
  assert.equal(parseInspectionPages([""], laudo).issues.length, 1);
  const ordered = parseInspectionPages(
    ["Inspeção inicial 18/07/2026\nÚltima inspeção 25/07/2026\nPróxima inspeção 22/07/2026"],
    laudo,
  );
  assert.equal(ordered.fields.inspection?.value, "2026-07-25");
  assert.equal(ordered.fields.due, undefined);
});

test("usa o dia civil e a janela de trinta dias para os indicadores", () => {
  assert.equal(inspectDueStatus("2027-03-01", "2027-01-30"), "soon");
  assert.equal(inspectDueStatus("2027-03-01", "2027-01-29"), "current");
  assert.equal(inspectDueStatus("2027-03-01", "2027-03-01"), "soon");
  assert.equal(inspectDueStatus("2027-03-01", "2027-03-02"), "overdue");
  assert.equal(inspectDueStatus(null, "2027-03-02"), "unknown");
  assert.equal(formatInspectionDate("2027-03-01"), "01/03/2027");
});

test("leva ao lacre apenas números explicitamente identificados e preserva os zeros", () => {
  assert.deepEqual(
    parseInspectionPages(
      [
        "ART nº 93837212\nLACRE / REGIME\n00702 / 00919 / restrição",
        "Inspeção inicial 18/07/2026 — comprovada pelo lacre Nº 00919",
      ],
      laudo,
    ).seal,
    { value: "00702 / 00919", page: 1, label: "Lacre" },
  );
  const ambiguous = parseInspectionPages(["Lacre 00001", "Lacre 00002"], laudo);
  assert.equal(ambiguous.seal, undefined);
  assert(ambiguous.issues.some((issue) => issue.includes("Lacre")));
});
