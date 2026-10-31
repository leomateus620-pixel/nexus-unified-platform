import type { ReactNode } from "react";

/** Presentation only. Unknown properties remain readable and are never rewritten. */
export const nrObject = (value: unknown): Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const labels: Record<string, string> = {
  situacao: "Situação",
  responsavel: "Responsável",
  revisoes: "Revisões",
  memoria: "Memória de cálculo",
  aprovador: "Aprovador histórico",
  data: "Data de origem",
  vigente: "Vigente",
  superada: "Anterior / superada",
  substituicao_declarada: "Substituição declarada na origem",
  desatualizacao_declarada: "Desatualização declarada na origem",
  rascunho: "Rascunho",
  emitido_origem: "Emitido na origem",
  em_revisao: "Em revisão",
  altura: "Trabalho em altura",
  confirmado_ec: "Espaço confinado confirmado",
  nao_ec: "Não é espaço confinado",
  ALTURA: "Trabalho em altura",
  EC: "Espaço confinado",
  nao_avaliado: "Não avaliado",
  concluido: "Concluído na origem",
  em_andamento: "Em andamento",
  nao_verificado: "Não verificado",
  nao_aplicavel: "Não aplicável",
  aplicavel: "Aplicável",
  nao_conforme: "Não conforme",
  nao_avaliada: "Não avaliada",
  sem_decisao: "Sem decisão",
  nao_revisado: "Não revisado",
  nao_validado: "Não validado",
  exigido_nao_identificado: "Exigido, não identificado",
  cilindrica: "Cilíndrica",
  prismatica: "Prismática",
  validada: "Validada",
  metodo: "Método de obtenção",
  deducoes: "Deduções registradas",
  retangular: "Retangular",
  irregular: "Irregular",
  volume: "Volume calculado na origem (m³)",
  volume_bruto: "Volume bruto (m³)",
  volume_documento: "Volume do documento (m³)",
  volume_placa: "Volume da placa (m³)",
  volume_informado: "Volume declarado (m³)",
  comprimento: "Comprimento (m)",
  largura: "Largura (m)",
  diametro: "Diâmetro (m)",
  altura_vao: "Altura do vão (m)",
  altura_piso: "Altura do piso (m)",
  fonte_volume: "Fonte do volume",
  nota_validacao: "Justificativa histórica",
  validacao: "Validação histórica",
  validacao_nexus: "Revisão na Nexus",
  autor: "Autor histórico",
  atualizado_por: "Atualizado por na origem",
  atualizado_em: "Atualização na origem",
  iniciado_em: "Início na origem",
  concluido_em: "Conclusão declarada na origem",
  vazao_nominal: "Vazão nominal (m³/h)",
  vazao_efetiva: "Vazão efetiva declarada (m³/h)",
  vazao_total: "Vazão total (m³/h)",
  vazao_unitaria: "Vazão unitária (m³/h)",
  criterio_n: "Renovações por hora adotadas",
  criterio_N: "Volumes de purga adotados",
  Q: "Vazão adotada (m³/h)",
  n: "Renovações por hora",
  N: "Volumes de purga",
  t_um_volume: "Tempo para um volume (min)",
  t_N_volumes: "Tempo de purga (min)",
  tempo_memorial_min: "Tempo do memorial (min)",
  tempo_placa: "Tempo da placa (min)",
  tempo_placa_texto: "Tempo indicado na placa",
  placas_instaladas_em: "Instalação das placas",
  existencia: "Existência",
  aplicabilidade: "Aplicabilidade",
  condicao: "Condição",
  acao: "Ação",
  historico_equipamento: "Histórico operacional do equipamento",
  tag_campo: "TAG lida em campo",
  criterio_fonte: "Evidência do enquadramento",
  criterio_acesso: "Acesso restrito",
  criterio_ocupacao: "Ocupação não contínua",
  criterio_ventilacao: "Ventilação limitada",
  sinalizacao_nota: "Sinalização observada",
  pontos_bloqueio: "Pontos de bloqueio",
  plano_bloqueio: "Plano de bloqueio",
  responsavel_nr33: "Responsável pela NR-33 na origem",
  responsavel_documentacao: "Responsável pela documentação na origem",
  elaboracao: "Levantamento e elaboração",
  art: "ART registrada na origem",
  cnpj: "CNPJ",
  epis: "EPI previstos",
};
const fieldLabels: Record<string, string> = { altura: "Altura (m)" };
export function nrLabel(key: string): string {
  return labels[key] ?? key.replaceAll("_", " ").replace(/^./, (c) => c.toLocaleUpperCase("pt-BR"));
}
export function nrDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split("-").reverse().join("/");
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf())
    ? value
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(parsed);
}
export function NrValue({ value }: { value: unknown }): ReactNode {
  if (value == null || value === "") return <span className="nr-muted">Não informado</span>;
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (typeof value === "number")
    return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 8 }).format(value);
  if (typeof value === "string")
    return (
      <span className="nr-prewrap">
        {labels[value] ?? (/^\d{4}-\d{2}-\d{2}$/.test(value) ? nrDate(value) : value)}
      </span>
    );
  if (Array.isArray(value))
    return value.length ? (
      <ul className="nr-value-list">
        {value.map((v, i) => (
          <li key={i}>
            <NrValue value={v} />
          </li>
        ))}
      </ul>
    ) : (
      <span className="nr-muted">Nenhum registro</span>
    );
  return <NrFacts value={value} />;
}
export function NrFacts({
  value,
  keys,
  omit = [],
}: {
  value: unknown;
  keys?: string[];
  omit?: string[];
}) {
  const object = nrObject(value);
  const entries = keys
    ? keys.filter((k) => k in object).map((k) => [k, object[k]] as const)
    : Object.entries(object);
  return (
    <dl className="nr-technical-facts">
      {entries
        .filter(([k]) => !omit.includes(k))
        .map(([key, v]) => (
          <div key={key}>
            <dt>{fieldLabels[key] ?? nrLabel(key)}</dt>
            <dd>
              <NrValue value={v} />
            </dd>
          </div>
        ))}
    </dl>
  );
}
