import { memo, useId, type ReactNode } from "react";

type ItemIdentity = {
  id: string;
  codigo: string;
  descricao: string;
  fabricante: string | null;
  ncm: string | null;
  unidade: string;
  modalidade: string;
  incluido_orcamento: boolean;
  quantidade_avulsa?: number;
};

type CommercialRowProps = {
  item: ItemIdentity;
  selected: boolean;
  batchChecked: boolean;
  editable: boolean;
  price: string;
  quantity: string;
  typeName?: string;
  cost?: string | undefined;
  pricePending?: boolean;
  extra?: ReactNode;
  onInspect: (id: string, trigger: HTMLButtonElement) => void;
  onToggleIncluded: (id: string, included: boolean) => void;
  onToggleBatch: (id: string, checked: boolean) => void;
};

/** Compact collection entry with separate controls for inspection, inclusion and batch actions. */
export const ProductComponentCard = memo(function ProductComponentCard({
  item,
  selected,
  batchChecked,
  editable,
  price,
  quantity,
  typeName,
  cost,
  pricePending,
  extra,
  onInspect,
  onToggleIncluded,
  onToggleBatch,
}: CommercialRowProps) {
  const id = useId();
  return (
    <li
      className="nx-commercial-row"
      data-selected={selected}
      data-included={item.incluido_orcamento}
    >
      <article aria-labelledby={id}>
        <div className="nx-commercial-row-identity">
          <h3 id={id}>
            <button
              type="button"
              className="nx-object-open"
              aria-label={`${editable ? "Editar" : "Consultar"} item ${item.codigo}`}
              aria-expanded={selected}
              title={item.descricao}
              onClick={(event) => onInspect(item.id, event.currentTarget)}
            >
              <span>{item.descricao}</span>
              <span aria-hidden="true">↗</span>
            </button>
          </h3>
          <code>{item.codigo}</code>
          <p>
            {typeName && typeName !== "—" ? typeName : "Tipo não informado"} · {item.unidade} ·{" "}
            <span className="capitalize">{item.modalidade}</span>
          </p>
          {extra}
        </div>
        <dl className="nx-commercial-row-values">
          <div>
            <dt>Manual adicional</dt>
            <dd>
              {Number(item.quantidade_avulsa ?? 0).toLocaleString("pt-BR")} {item.unidade}
            </dd>
          </div>
          <div>
            <dt>Consolidada</dt>
            <dd>{item.incluido_orcamento ? quantity : "Fora do orçamento"}</dd>
          </div>
          <div>
            <dt>{pricePending ? "Prévia do preço / un." : "Preço / un."}</dt>
            <dd>{price}</dd>
          </div>
          {cost !== undefined && (
            <div>
              <dt>Custo adotado / un.</dt>
              <dd>{cost}</dd>
            </div>
          )}
        </dl>
        <div className="nx-commercial-row-controls">
          <label className="nx-object-check">
            <input
              type="checkbox"
              aria-label={`Incluir ${item.codigo} no orçamento`}
              checked={item.incluido_orcamento}
              disabled={!editable}
              onChange={(e) => onToggleIncluded(item.id, e.target.checked)}
            />
            <span>{item.incluido_orcamento ? "No orçamento" : "Disponível na revisão"}</span>
          </label>
          {editable && (
            <label className="nx-object-check">
              <input
                type="checkbox"
                aria-label={`Selecionar ${item.codigo} para edição em lote`}
                checked={batchChecked}
                onChange={(e) => onToggleBatch(item.id, e.target.checked)}
              />
              <span>Selecionar para lote</span>
            </label>
          )}
          {selected && <span className="nx-commercial-selected">Em edição nesta revisão</span>}
        </div>
      </article>
    </li>
  );
});
