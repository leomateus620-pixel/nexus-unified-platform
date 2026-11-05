/** Spreadsheet formulas are never executable in a downloaded operational report. */
export function csvCell(value: unknown): string {
  let text = value == null ? "" : String(value);
  if (/^[\s\uFEFF]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function petCsv(rows: Record<string, unknown>[], consulted: string) {
  const columns = [
    ["numero", "PET"],
    ["espaco_nome", "Espaço"],
    ["atividade", "Atividade"],
    ["estado_documental", "Estado documental"],
    ["condicao_operacional", "Condição operacional"],
    ["validade_temporal", "Validade"],
    ["presentes", "Presenças registradas"],
    ["emitida_em", "Emissão"],
    ["encerrada_em", "Encerramento"],
    ["unidade_id", "Unidade"],
    ["espaco_id", "Espaço ID"],
    ["id", "PET ID"],
  ] as const;
  return (
    "\uFEFF" +
    [
      columns
        .map((c) => csvCell(c[1]))
        .concat(csvCell("Consultado em"))
        .join(";"),
      ...rows.map((r) =>
        columns
          .map((c) => csvCell(r[c[0]]))
          .concat(csvCell(consulted))
          .join(";"),
      ),
    ].join("\r\n")
  );
}
export function downloadCsv(text: string, name: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
