import { decimalTextoSchema, unidadesPorGrandeza } from "./schemas";
import type { EstadoLevantamento, LevantamentoDetalhe, LevantamentoMedicao } from "./types";

export const estadosLevantamento: Record<EstadoLevantamento, string> = {
  rascunho: "Rascunho",
  programado: "Programado",
  em_coleta: "Em coleta",
  em_revisao: "Em revisão",
  aprovado: "Aprovado",
  cancelado: "Cancelado",
};
export const grandezasLevantamento = {
  comprimento: "Comprimento",
  area: "Área",
  contagem: "Contagem",
  angulo: "Ângulo",
  forca: "Força",
} as const;

/** Comparação decimal exata para feedback; não substitui validação/conversão SQL. */
export function compararDecimais(a: string, b: string): -1 | 0 | 1 {
  const left = decimalTextoSchema.parse(a);
  const right = decimalTextoSchema.parse(b);
  const [li = "0", lf = ""] = left.split(".");
  const [ri = "0", rf = ""] = right.split(".");
  const scale = Math.max(lf.length, rf.length);
  const l = BigInt(li + lf.padEnd(scale, "0"));
  const r = BigInt(ri + rf.padEnd(scale, "0"));
  return l < r ? -1 : l > r ? 1 : 0;
}

export type PendenciaColeta = {
  ponto_id: string | null;
  medicao_id: string | null;
  descricao: string;
};
/** Ajuda de coleta baseada no modelo fixado; a submissão sempre revalida no banco. */
export function pendenciasColeta(detail: LevantamentoDetalhe): PendenciaColeta[] {
  const pending: PendenciaColeta[] = [];
  const add = (ponto: string | null, medicao: string | null, descricao: string) =>
    pending.push({ ponto_id: ponto, medicao_id: medicao, descricao });
  if (!detail.pontos.length) add(null, null, "Cadastre ao menos um ponto.");
  if (detail.arquivos.some((a) => a.estado === "pendente" || a.estado === "enviado"))
    add(null, null, "Confirme ou cancele os envios pendentes antes de enviar à revisão.");
  for (const ponto of detail.pontos) {
    const measures = detail.medicoes.filter((m) => m.ponto_id === ponto.id);
    const photo = detail.arquivos.some(
      (a) => a.ponto_id === ponto.id && a.estado === "vinculado" && a.mime.startsWith("image/"),
    );
    if (!measures.length) add(ponto.id, null, `${ponto.codigo}: cadastre ao menos uma medida.`);
    if (ponto.exige_foto && !photo)
      add(ponto.id, null, `${ponto.codigo}: foto obrigatória pendente.`);
    for (const m of measures) {
      const context = `${ponto.codigo} · ${m.chave}`;
      if (m.valor === null || !decimalTextoSchema.safeParse(m.valor).success)
        add(ponto.id, m.id, `${context}: informe o valor decimal.`);
      if (!(unidadesPorGrandeza[m.grandeza] as readonly string[]).includes(m.unidade))
        add(ponto.id, m.id, `${context}: informe a unidade compatível.`);
      if (m.metodo.trim().length < 2)
        add(ponto.id, m.id, `${context}: descreva o método ou a fonte documental.`);
      if (!m.coletado_em) add(ponto.id, m.id, `${context}: informe a data/hora da coleta.`);
      if (m.natureza === "medida" && m.precisao === null)
        add(ponto.id, m.id, `${context}: informe a precisão da medida.`);
      if (m.origem === "modelo_3d" && m.natureza !== "estimativa")
        add(ponto.id, m.id, `${context}: dado 3D precisa ser identificado como estimativa.`);
    }
    for (const rule of detail.modelo?.requisitos ?? []) {
      const m = measures.find((item) => item.chave === rule.chave);
      if (!m) {
        if (rule.obrigatoria !== false)
          add(ponto.id, null, `${ponto.codigo}: falta a medida ${rule.chave} do modelo fixado.`);
        continue;
      }
      if (m.grandeza !== rule.grandeza || m.unidade !== rule.unidade)
        add(
          ponto.id,
          m.id,
          `${ponto.codigo} · ${m.chave}: grandeza/unidade divergem do modelo fixado.`,
        );
      if (m.valor !== null && decimalTextoSchema.safeParse(m.valor).success) {
        if (rule.minimo != null && compararDecimais(m.valor, rule.minimo) < 0)
          add(
            ponto.id,
            m.id,
            `${ponto.codigo} · ${m.chave}: abaixo do mínimo configurado no modelo.`,
          );
        if (rule.maximo != null && compararDecimais(m.valor, rule.maximo) > 0)
          add(
            ponto.id,
            m.id,
            `${ponto.codigo} · ${m.chave}: acima do máximo configurado no modelo.`,
          );
      }
      if (rule.exige_foto && !photo)
        add(ponto.id, m.id, `${ponto.codigo} · ${m.chave}: foto exigida no modelo pendente.`);
    }
  }
  return pending;
}

export function medicaoAdotavel(
  medicao: LevantamentoMedicao,
  estado: EstadoLevantamento,
  campo: "metragem" | "trechos",
) {
  if (
    estado !== "aprovado" ||
    medicao.natureza !== "medida" ||
    medicao.origem === "modelo_3d" ||
    medicao.valor === null
  )
    return false;
  if (!decimalTextoSchema.safeParse(medicao.valor).success) return false;
  return campo === "metragem"
    ? medicao.grandeza === "comprimento" &&
        (unidadesPorGrandeza.comprimento as readonly string[]).includes(medicao.unidade)
    : medicao.grandeza === "contagem" && medicao.unidade === "un";
}

export function prepararDuplicacaoPonto(detail: LevantamentoDetalhe, pontoId: string) {
  const point = detail.pontos.find((p) => p.id === pontoId);
  if (!point) throw new Error("Ponto indisponível.");
  return {
    codigo: "",
    nome: point.nome,
    area: point.area,
    localizacao: point.localizacao,
    tipo_sistema: point.tipo_sistema,
    observacoes: "",
    exige_foto: point.exige_foto,
    medicoes: detail.medicoes
      .filter((m) => m.ponto_id === pontoId)
      .map((m) => ({
        chave: m.chave,
        grandeza: m.grandeza,
        valor: null,
        unidade: m.unidade,
        precisao: null,
        metodo: "",
        origem: "campo" as const,
        natureza: "medida" as const,
        coletado_em: null,
        observacoes: "",
      })),
  };
}
