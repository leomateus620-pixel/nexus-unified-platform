import { History } from "lucide-react";
import type { ProposalSaveEvent } from "../save-types";
import { ObjectCard } from "./ObjectCards";
import { brl, brlUnit, qtd } from "@/lib/format";

const labels: Record<string, string> = {
  incluido_orcamento: "Incluído no orçamento",
  identificacao: "Identificação",
  tipo: "Tipo",
  metragem: "Metragem",
  trechos: "Trechos",
  modalidade: "Modalidade",
  fornecedor_id: "Fornecedor",
  custo_adotado: "Custo adotado",
  override_quantidade: "Quantidade ajustada",
  objeto: "Objeto",
  validade: "Validade",
  garantia: "Garantia",
  condicoes: "Condições",
  responsavel_tecnico: "Responsável técnico",
  markup: "Markup",
  desconto: "Desconto",
  frete_materiais: "Frete dos materiais",
  montagem_percentual: "Montagem",
  preco_item_tecnico: "Preço do item técnico",
  aliquota_precificacao: "Provisão de imposto",
  aliquota_interestadual: "Alíquota interestadual",
  aliquota_interna_destino: "Alíquota interna de destino",
  difal_ativo: "DIFAL",
  tecnicos_por_equipe: "Técnicos por equipe",
  produtividade_telhado_m_dia: "Produtividade telhado",
  produtividade_overhead_m_dia: "Produtividade overhead",
  horas_por_dia: "Jornada",
  horas_engenharia: "Horas de engenharia",
  custo_hora_tecnico: "Custo hora técnico",
  custo_hora_engenheiro: "Custo hora engenheiro",
  alimentacao_dia: "Alimentação por dia",
  hospedagem_dia: "Hospedagem por dia",
  preco_combustivel: "Preço do combustível",
  km_por_litro: "Consumo do veículo",
  distancia_ida_volta_km: "Distância ida e volta",
  dias_por_viagem: "Dias por viagem",
};
const currencies = new Set([
  "custo_adotado",
  "preco_item_tecnico",
  "custo_hora_tecnico",
  "custo_hora_engenheiro",
  "alimentacao_dia",
  "hospedagem_dia",
  "preco_combustivel",
]);
const fractions = new Set([
  "markup",
  "desconto",
  "frete_materiais",
  "montagem_percentual",
  "aliquota_precificacao",
  "aliquota_interestadual",
  "aliquota_interna_destino",
]);
const units: Record<string, string> = {
  metragem: "m",
  trechos: "trechos",
  horas_por_dia: "h/dia",
  horas_engenharia: "h",
  produtividade_telhado_m_dia: "m/equipe-dia",
  produtividade_overhead_m_dia: "m/equipe-dia",
  distancia_ida_volta_km: "km",
  km_por_litro: "km/L",
  dias_por_viagem: "dias/viagem",
};
function value(v: unknown, field: string) {
  if (typeof v === "number") {
    if (currencies.has(field)) return brlUnit(v);
    if (fractions.has(field))
      return `${(v * 100).toLocaleString("pt-BR", { maximumFractionDigits: 8 })}%`;
    return qtd(v, units[field], 8);
  }
  return v == null
    ? "Não informado / removido"
    : typeof v === "boolean"
      ? v
        ? "Sim"
        : "Não"
      : String(v);
}
export function SaveEventCard({ event }: { event: ProposalSaveEvent }) {
  const groups = new Map<string, typeof event.diferencas>();
  event.diferencas.forEach((d) => groups.set(d.objeto, [...(groups.get(d.objeto) ?? []), d]));
  return (
    <ObjectCard
      title="Alterações confirmadas"
      className="nx-save-event-card"
      eyebrow={
        <>
          <History size={18} aria-hidden="true" />
          <time dateTime={event.created_at}>
            {new Date(event.created_at).toLocaleString("pt-BR")}
          </time>
          <span>Checkpoint {event.versao_destino}</span>
        </>
      }
    >
      <p className="nx-object-meta">
        Consolidado por {event.autor_nome || "Autoria não registrada"}
      </p>
      <strong>
        {event.objetos} {event.objetos === 1 ? "objeto alterado" : "objetos alterados"} ·{" "}
        {event.campos} {event.campos === 1 ? "campo" : "campos"}
      </strong>
      <p className="nx-object-meta">
        {[...groups.values()]
          .slice(0, 3)
          .map((changes) => changes[0]?.nome)
          .join(" · ")}
        {groups.size > 3 ? ` · +${groups.size - 3} objetos` : ""}
      </p>
      <details className="nx-save-differences">
        <summary>Ver alterações</summary>
        {[...groups].map(([key, changes]) => (
          <section key={key}>
            <h4>{changes[0]?.nome}</h4>
            {changes.map((d) => (
              <div className="nx-save-difference" key={d.campo}>
                <strong>{labels[d.campo] ?? d.campo}</strong>
                <dl>
                  <div>
                    <dt>Antes</dt>
                    <dd>{d.antes_rotulo ?? value(d.antes, d.campo)}</dd>
                  </div>
                  <div>
                    <dt>Depois</dt>
                    <dd>{d.depois_rotulo ?? value(d.depois, d.campo)}</dd>
                  </div>
                </dl>
                <p>
                  Alterado por:{" "}
                  {d.autores.length
                    ? d.autores.map((a) => a.autor_nome ?? "Autoria não registrada").join(", ")
                    : "Autoria não registrada (origem legada ou efeito da exclusão)"}
                </p>
                {d.justificativa && <p>Justificativa: {d.justificativa}</p>}
              </div>
            ))}
          </section>
        ))}
        {event.impacto && (
          <section>
            <h4>Efeito calculado</h4>
            <p>
              Total do checkpoint anterior:{" "}
              {event.impacto.total_anterior == null
                ? "Não disponível"
                : brl(event.impacto.total_anterior)}{" "}
              → {brl(event.impacto.total_calculado)}
            </p>
            <p>Os resultados derivados não aumentam a contagem de campos.</p>
          </section>
        )}
        <p className="nx-object-meta">
          Checkpoint {event.versao_origem} → {event.versao_destino}. Operação {event.id}.{" "}
          {event.calculo_id && `Cálculo ${event.calculo_id}.`}
        </p>
      </details>
    </ObjectCard>
  );
}
