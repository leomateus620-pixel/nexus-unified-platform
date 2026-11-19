import assert from "node:assert/strict";
import test from "node:test";
import { layoutDescriptions } from "../../src/features/cruz-alta/layout-descriptions";
import { parseCruzAltaLayoutCells } from "../../src/features/cruz-alta/inspection-layout.server";
import { surveyItems } from "../../src/features/cruz-alta/linhas";

const cell = (text: string, x: number, y: number, width = 8) => ({ text, x, y, width });
const header = [
  cell("ITEM", 60, 990),
  cell("DESCRIÇÃO LOCAIS LINHA DE VIDA HORIZONTAL FLEXÍVEL", 95, 990),
  cell("UN.", 400, 990),
  cell("M x UN", 445, 990),
  cell("LACRE", 500, 990),
  cell("SITUAÇÃO", 590, 990),
  cell("REVISÃO:", 590, 40, 25),
  cell("32", 605, 10),
];
const fixture = [
  ...header,
  ...Array.from({ length: 41 }, (_, index) => {
    const y = 960 - 19 * index;
    return [
      cell(index === 40 ? "39.1*" : String(index + 1), 63, y),
      cell(
        index === 10 ? "TELHADO TESTE - (01 UNIDADE)" : "ESTRUTURA TESTE - LVHF - (01 UNIDADE)",
        95,
        y,
      ),
      cell(index === 10 ? "00557 / 00441" : "-", 500, y),
      cell("MONTADA", 590, y),
    ];
  }).flat(),
];

test("lê a descrição e o lacre somente nas colunas da tabela e usa a revisão do carimbo", () => {
  const { revision, rows } = parseCruzAltaLayoutCells(fixture);
  assert.equal(revision, 32);
  assert.equal(rows.length, 41);
  assert.deepEqual(rows[10], {
    code: "11",
    description: "TELHADO TESTE - (01 UNIDADE)",
    seal: "00557 / 00441",
  });
  assert.equal(rows[40]?.code, "39.1");
  assert.equal(rows[0]?.seal, null);
  assert.throws(() => parseCruzAltaLayoutCells([...fixture, cell("02", 63, 960)]), /TAG repetida/);
  assert.throws(() => parseCruzAltaLayoutCells(fixture.slice(0, 11)), /incompleto/);
});

test("a revisão 56 dá um título conferido em maiúsculas a todas as TAGs atuais", () => {
  assert.equal(Object.keys(layoutDescriptions).length, surveyItems.length);
  for (const entry of surveyItems) assert(layoutDescriptions[entry.code]);
  assert.equal(layoutDescriptions["11"], "TELHADO ARMAZEM 01 - LVHF 90M - (01 UNIDADE)");
  assert.notEqual(layoutDescriptions["57"], layoutDescriptions["57.1"]);
});
