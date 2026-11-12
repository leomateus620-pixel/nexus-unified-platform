/* eslint-disable react-refresh/only-export-components -- Formatting functions are shared by the Inspeções display components. */
import {
  AlertCircle,
  ArrowUpRight,
  CalendarClock,
  CircleHelp,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { NrCard, NrCardMeta } from "@/features/nr/NrCards";
import type { InspecoesRegistro, InspecoesRecurso, InspecoesUnidade } from "./ui-contract";

const labels: Record<string, string> = {
  apto: "Apto",
  apto_restricao: "Apto com restrição",
  apto_com_restricao: "Apto com restrição",
  nao_apto: "Não apto",
  nao_inspecionado: "Não inspecionado",
  candidato_apto: "Candidato a apto",
  em_aviso: "Em aviso",
  em_dia: "Em dia",
  vencido: "Vencido",
  em_revisao: "Em revisão",
  original_verificado: "Original verificado",
  original_pendente: "Original pendente",
  disponivel_verificado: "Original disponível",
  snapshot_textual: "Snapshot textual",
  referencia_externa: "Referência externa",
  falha_processamento: "Falha de processamento",
  pendente: "Pendente",
  recebido: "Recebido",
  emitido: "Emitido",
  vigente: "Vigente",
  aberta: "Aberta",
  aprovado: "Aprovado",
  aprovada: "Aprovada",
  restricao: "Restrição",
  indefinido: "Indefinido",
  sem_inspecao_vigente: "Sem inspeção vigente",
  sem_validade: "Validade não definida",
  em_aviso_90_dias: "Em aviso",
  data_precisao: "Precisão da data",
  data_ref: "Data de referência",
  situacao: "Situação",
  estado: "Estado",
  resultado_rt: "Parecer técnico na origem",
  r64: "Reinspeção R64",
  art: "ART",
  tag: "TAG",
  descricao: "Descrição",
  observacao: "Observação",
  observacoes: "Observações",
  revisao: "Revisão",
  titulo: "Título",
  codigo: "Código",
  familia: "Família",
  tipo_inspecao: "Tipo de inspeção",
  recomendacao: "Recomendação",
  codigo_documento: "Código do documento",
  cnae: "CNAE",
  cnpj: "CNPJ",
  cnpj_matriz: "CNPJ da matriz",
  id: "ID",
  escopo_incluso: "Escopo incluso",
  escopo_excluso: "Escopo excluído",
  acao: "Ação",
  selecao: "Seleção",
  hrn_referencia: "Referência HRN",
  autor: "Autor",
  texto: "Texto",
  data: "Data",
  conclusao: "Conclusão",
  responsavel: "Responsável",
  tecnico: "Técnico",
  resultado_calculado: "Resultado calculado",
  resultado_relatorio: "Resultado no laudo",
  titular: "Titular",
  unidade: "Unidade",
  notas: "Notas",
  zona_calculada: "Zona calculada",
};

export const recursosLabels: Record<InspecoesRecurso, string> = {
  documentos: "Documento",
  ativos: "Ativo",
  plantas: "Planta",
  equipamentos: "Equipamento de ensaio",
  pendencias: "Pendência",
  importacoes: "Importação",
  servicos: "Serviço",
  tipos: "Tipo de inspeção",
  familias: "Família",
  matrizes: "Matriz",
  pacotes: "Pacote",
  avisos: "Aviso",
  vencimentos: "Vencimento R64",
  regras: "Regra",
  textos: "Texto-padrão",
  parametros: "Parâmetro",
  listas: "Lista fechada",
  registro: "Registro",
  contratos: "Contrato",
  ensaios: "Ensaio",
  os: "Ordem de serviço",
  inspecoes: "Inspeção histórica",
  configuracoes: "Configuração",
};

export function legenda(value: string) {
  return (
    labels[value] ?? value.replace(/[_-]+/g, " ").replace(/^\p{L}/u, (match) => match.toUpperCase())
  );
}

export function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : typeof value === "number" ? String(value) : "";
}

export function objeto(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function dataCivil(value: unknown) {
  const raw = texto(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw.split("-").reverse().join("/");
  if (/^\d{4}-\d{2}-\d{2}T/.test(raw)) {
    const date = new Date(raw);
    if (!Number.isNaN(date.getTime()))
      return new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(date);
  }
  return raw;
}

export function Badge({
  value,
  kind = "registro",
}: {
  value: string;
  kind?: "prazo" | "tecnico" | "registro";
}) {
  let Icon: LucideIcon = CircleHelp;
  if (kind === "prazo") Icon = CalendarClock;
  if (kind === "tecnico") Icon = ShieldCheck;
  if (["nao_apto", "vencido", "critica", "critico"].includes(value)) Icon = AlertCircle;
  return (
    <span className="insp-badge" data-kind={kind} data-value={value}>
      <Icon size={13} aria-hidden="true" />
      {kind === "prazo" ? "R64 · " : kind === "tecnico" ? "Técnico · " : ""}
      {legenda(value)}
    </span>
  );
}

export function Fatos({ items }: { items: readonly (readonly [string, ReactNode])[] }) {
  const present = items.filter(
    ([, value]) => value !== undefined && value !== null && value !== "",
  );
  if (!present.length) return null;
  return (
    <NrCardMeta className="insp-facts">
      {present.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </NrCardMeta>
  );
}

export function contextoRegistro(record: InspecoesRegistro, unidades: InspecoesUnidade[]) {
  const unit = unidades.find(({ unidade_id }) => unidade_id === record.unidade_id);
  if (unit) return [unit.cliente_nome, unit.unidade_nome].filter(Boolean).join(" · ");
  const client = unidades.find(({ cliente_id }) => cliente_id === record.cliente_id);
  return client?.cliente_nome;
}

export function RegistroCard({
  item,
  unidades,
  abrir,
}: {
  item: InspecoesRegistro;
  unidades: InspecoesUnidade[];
  abrir: (item: InspecoesRegistro, trigger: HTMLElement) => void;
}) {
  const summary = item.resumo ?? {};
  const revision = texto(summary["revisao"]);
  const due = dataCivil(summary["vence"] ?? summary["vencimento"]);
  const r64 = texto(summary["r64_status"] ?? objeto(summary["r64"])["status"]);
  const result = texto(summary["resultado"]);
  const context = contextoRegistro(item, unidades);
  const status = item.situacao;
  return (
    <NrCard className="insp-record">
      <div className="insp-record-heading">
        <p className="insp-kicker">
          {item.codigo && item.codigo !== item.titulo ? item.codigo : recursosLabels[item.colecao]}
          {revision && <span className="insp-revision">Rev. {revision}</span>}
        </p>
        <h3>
          <button
            type="button"
            onClick={(e) => abrir(item, e.currentTarget)}
            className="insp-record-open"
          >
            {item.titulo}
            <ArrowUpRight aria-hidden="true" size={16} />
          </button>
        </h3>
        {context && <p className="insp-context-note">{context}</p>}
      </div>
      <Fatos
        items={[
          ["Família", item.familia],
          ["Setor", texto(summary["setor"])],
          ["Local", texto(summary["local"])],
          ["Vencimento R64", due],
          ["Data de referência", dataCivil(item.data_ref)],
          ["Criticidade", texto(summary["criticidade"]) && legenda(texto(summary["criticidade"]))],
        ]}
      />
      {(status || r64 || result) && (
        <div className="insp-badges">
          {status && (item.colecao !== "vencimentos" || !r64) && (
            <Badge value={status} kind={item.colecao === "vencimentos" ? "prazo" : "registro"} />
          )}
          {r64 && <Badge value={r64} kind="prazo" />}
          {result && <Badge value={result} kind="tecnico" />}
        </div>
      )}
    </NrCard>
  );
}

export function ValorEstruturado({ value, depth = 0 }: { value: unknown; depth?: number }) {
  if (value === null || value === undefined || value === "") return <span>Não informado</span>;
  if (typeof value === "boolean") return <span>{value ? "Sim" : "Não"}</span>;
  if (typeof value !== "object")
    return <span className="insp-preserve-lines">{dataCivil(value) || String(value)}</span>;
  if (depth > 8) return <span>Detalhe disponível no registro de origem.</span>;
  if (Array.isArray(value)) {
    if (!value.length) return <span>Nenhum registro</span>;
    return (
      <ul className="insp-structured-list">
        {value.map((item, index) => (
          <li key={index}>
            <ValorEstruturado value={item} depth={depth + 1} />
          </li>
        ))}
      </ul>
    );
  }
  const entries = Object.entries(objeto(value)).filter(
    ([, item]) => item !== null && item !== undefined && item !== "",
  );
  return entries.length ? (
    <dl className="insp-structured">
      {entries.map(([label, item]) => (
        <div key={label}>
          <dt>{legenda(label)}</dt>
          <dd>
            <ValorEstruturado value={item} depth={depth + 1} />
          </dd>
        </div>
      ))}
    </dl>
  ) : (
    <span>Nenhum campo preenchido</span>
  );
}
