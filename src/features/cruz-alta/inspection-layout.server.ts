import "@tanstack/react-start/server-only";
import { getResolvedPDFJS } from "unpdf";

type LayoutCell = { text: string; x: number; y: number; width: number };
export type LayoutRow = { code: string; description: string; seal: string | null };

const itemNumber = /^(\d{1,2})(?:[.,](\d{1,2}))?\s*\*{0,3}$/;
const sealNumber = /^\d{1,14}(?:\s*(?:\/|,|\+|\be\b)\s*\d{1,14})*$/i;
const headerText = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Mark}/gu, "")
    .trim()
    .toUpperCase();
const sameRow = (a: LayoutCell, b: LayoutCell) => Math.abs(a.y - b.y) <= 1.25;

export function parseCruzAltaLayoutCells(cells: LayoutCell[]) {
  const title = cells.find((cell) =>
    headerText(cell.text).startsWith("DESCRICAO LOCAIS LINHA DE VIDA"),
  );
  const item =
    title &&
    cells.find(
      (cell) => sameRow(cell, title) && cell.x < title.x && headerText(cell.text) === "ITEM",
    );
  const seals =
    title &&
    cells.find(
      (cell) => sameRow(cell, title) && cell.x > title.x && headerText(cell.text) === "LACRE",
    );
  const units =
    title &&
    cells.find(
      (cell) => sameRow(cell, title) && cell.x > title.x && headerText(cell.text) === "UN.",
    );
  const total =
    units &&
    seals &&
    cells.find(
      (cell) =>
        sameRow(cell, units) &&
        cell.x > units.x &&
        cell.x < seals.x &&
        headerText(cell.text) === "M X UN",
    );
  const status =
    seals &&
    cells.find(
      (cell) => sameRow(cell, seals) && cell.x > seals.x && headerText(cell.text) === "SITUACAO",
    );
  const revLabel = cells.find(
    (cell) => /^REVISAO:?$/.test(headerText(cell.text)) && (!status || cell.x >= status.x - 25),
  );
  if (!title || !item || !seals || !units || !total || !status || !revLabel)
    throw new Error("Cabeçalho do quadro de LVHF ou carimbo da revisão ausente.");

  const printedRevision = cells.filter(
    (cell) =>
      cell.y < revLabel.y &&
      revLabel.y - cell.y < 55 &&
      cell.x >= revLabel.x - 5 &&
      cell.x <= revLabel.x + revLabel.width + 25 &&
      /^\d{1,3}$/.test(cell.text.trim()),
  );
  if (printedRevision.length !== 1) throw new Error("Revisão da prancha ambígua no carimbo.");
  const revision = Number(printedRevision[0]?.text);
  const rows: LayoutRow[] = [];
  const ids = new Set<string>();
  const left = item.x - (title.x - item.x) / 2;
  const sealLeft = (total.x + seals.x) / 2;
  const sealRight = (seals.x + status.x) / 2;
  for (const codeCell of cells) {
    if (
      codeCell.x < left ||
      codeCell.x >= title.x - 3 ||
      codeCell.y >= title.y - 4 ||
      codeCell.y <= revLabel.y
    )
      continue;
    const found = itemNumber.exec(codeCell.text.trim());
    if (!found?.[1]) continue;
    const code =
      String(Number(found[1])).padStart(2, "0") + (found[2] ? `.${Number(found[2])}` : "");
    const row = cells.filter((cell) => sameRow(cell, codeCell)).sort((a, b) => a.x - b.x);
    const description = row
      .filter((cell) => cell.x >= title.x - 5 && cell.x < units.x - 4)
      .map((cell) => cell.text.trim())
      .join(" ");
    if (
      !description ||
      !row.some(
        (cell) =>
          cell.x > sealRight &&
          /MONTAD[AO]|MONTAR|FORA DO PROJETO|APROVACAO/.test(headerText(cell.text)),
      )
    )
      continue;
    const lacre = row
      .filter((cell) => cell.x >= sealLeft && cell.x < sealRight)
      .map((cell) => cell.text.trim())
      .join(" ")
      .trim();
    if (ids.has(code) || (lacre && !/^[-–—]+$/.test(lacre) && !sealNumber.test(lacre)))
      throw new Error("TAG repetida ou lacre ambíguo no quadro da prancha.");
    ids.add(code);
    rows.push({
      code,
      description: description.toLocaleUpperCase("pt-BR"),
      seal: lacre && sealNumber.test(lacre) ? (lacre.match(/\d+/g) ?? []).join(" / ") : null,
    });
  }
  if (rows.length < 40 || !ids.has("01") || !ids.has("11"))
    throw new Error("Quadro de LVHF incompleto na folha principal.");
  return { revision, rows };
}

export async function parseCruzAltaLayoutPdf(bytes: Uint8Array) {
  const { getDocument } = await getResolvedPDFJS();
  const task = getDocument({
    data: bytes.slice(),
    disableFontFace: true,
    useSystemFonts: false,
    useWasm: false,
    stopAtErrors: true,
  });
  try {
    const pdf = await task.promise;
    const page = await pdf.getPage(1);
    try {
      const { items } = await page.getTextContent();
      return parseCruzAltaLayoutCells(
        items.flatMap((item) =>
          "str" in item &&
          item.str.trim() &&
          item.transform[4] !== undefined &&
          item.transform[5] !== undefined
            ? [{ text: item.str, x: item.transform[4], y: item.transform[5], width: item.width }]
            : [],
        ),
      );
    } finally {
      page.cleanup();
    }
  } finally {
    await task.destroy();
  }
}
