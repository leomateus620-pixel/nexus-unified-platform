/** Read-only projection. Historical narratives and photo occurrences never become audit events. */
export type EvidenceRecord = Record<string, unknown>;
const record = (value: unknown): EvidenceRecord =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as EvidenceRecord) : {};
const firstText = (value: EvidenceRecord, keys: string[]) => {
  for (const key of keys) {
    const candidate = value[key];
    if ((typeof candidate === "string" && candidate.trim()) || typeof candidate === "number")
      return String(candidate);
  }
  return "";
};
export function sourceDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "Data não informada";
  // A source date without time remains a date. Never create midnight or a timezone.
  const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (date) return `${date[3]}/${date[2]}/${date[1]}`;
  if (!/[zZ]$|[+-]\d{2}:?\d{2}$/.test(value)) return value;
  const instant = new Date(value);
  return Number.isNaN(instant.valueOf())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
      }).format(instant);
}
export type TechnicalEvent = {
  key: string;
  date: string;
  author: string;
  action: string;
  text: string;
  extra: EvidenceRecord;
};
const eventDates = [
  "data",
  "data_fato",
  "data_origem",
  "date",
  "quando",
  "timestamp",
  "criado_em",
  "atualizado_em",
];
const eventAuthors = [
  "autor",
  "autor_historico",
  "usuario",
  "responsavel",
  "author",
  "criado_por",
  "atualizado_por",
];
const eventActions = ["acao", "action", "evento", "tipo", "titulo"];
const eventTexts = [
  "texto",
  "descricao",
  "detalhe",
  "detalhes",
  "observacao",
  "observacoes",
  "mensagem",
  "text",
  "nota",
];
export function technicalEvents(value: unknown): TechnicalEvent[] {
  const entries = Array.isArray(value)
    ? value.map((item, i) => [String(i), item] as const)
    : Object.entries(record(value));
  const recognized = new Set([
    ...eventDates,
    ...eventAuthors,
    ...eventActions,
    ...eventTexts,
    "id",
  ]);
  return entries.map(([key, item]) => {
    const data = record(item);
    return {
      // An occurrence's identity includes its position; repeated narratives are not deduplicated.
      key,
      date: firstText(data, eventDates),
      author: firstText(data, eventAuthors),
      action: firstText(data, eventActions) || "Atualização técnica",
      text: typeof item === "string" ? item : firstText(data, eventTexts),
      extra: Object.fromEntries(Object.entries(data).filter(([name]) => !recognized.has(name))),
    };
  });
}
export type PhotoOccurrence = {
  key: string;
  caption: string;
  date: string;
  author: string;
  category: string;
  sourcePath: string;
  thumbnailPath: string;
  fileId: string | null;
  extra: EvidenceRecord;
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function photoOccurrences(value: unknown): PhotoOccurrence[] {
  const entries = Array.isArray(value)
    ? value.map((item, i) => [String(i), item] as const)
    : Object.entries(record(value));
  const keys = [
    "id",
    "legenda",
    "caption",
    "descricao",
    "titulo",
    "nome",
    "data",
    "data_foto",
    "data_origem",
    "criado_em",
    "autor",
    "autor_historico",
    "criado_por",
    "grupo",
    "categoria",
    "tipo",
    "arquivo_id",
    "nr_arquivo_id",
    "caminho",
    "path",
    "url",
    "arquivo",
    "src",
    "miniatura",
    "thumbnail",
    "thumb",
  ];
  return entries.map(([key, item]) => {
    const data = record(item),
      fileId = firstText(data, ["arquivo_id", "nr_arquivo_id"]);
    return {
      key,
      caption: firstText(data, ["legenda", "caption", "descricao", "titulo", "nome"]),
      date: firstText(data, ["data", "data_foto", "data_origem", "criado_em"]),
      author: firstText(data, ["autor", "autor_historico", "criado_por"]),
      category: firstText(data, ["grupo", "categoria", "tipo"]) || "Foto de campo",
      sourcePath:
        typeof item === "string"
          ? item
          : firstText(data, ["caminho", "path", "url", "arquivo", "src"]),
      thumbnailPath: firstText(data, ["miniatura", "thumbnail", "thumb"]),
      // Only a proved, explicit Nexus relation can authorize a binary. Paths/names never imply one.
      fileId: uuid.test(fileId) ? fileId : null,
      extra: Object.fromEntries(Object.entries(data).filter(([name]) => !keys.includes(name))),
    };
  });
}
