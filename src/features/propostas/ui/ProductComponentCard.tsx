import { memo } from "react";
import { FamilyMark, ObjectCard } from "./ObjectCards";

type ItemIdentity = {
  id: string;
  codigo: string;
  descricao: string;
  fabricante: string | null;
  ncm: string | null;
  unidade: string;
  modalidade: string;
};

type CommercialRowProps = {
  item: ItemIdentity;
  selected: boolean;
  checked: boolean;
  editable: boolean;
  supplier: string;
  cost: string | null;
  price: string;
  onInspect: (id: string, trigger: HTMLButtonElement) => void;
  onToggle: (id: string, checked: boolean) => void;
};

/** A component is an object, with independent selection and editing controls. */
export const ProductComponentCard = memo(function ProductComponentCard({
  item,
  selected,
  checked,
  editable,
  supplier,
  cost,
  price,
  onInspect,
  onToggle,
}: CommercialRowProps) {
  return (
    <ObjectCard
      title={item.descricao}
      selected={selected}
      className="nx-product-card"
      eyebrow={
        <>
          <FamilyMark description={item.descricao} />
          <span className="nx-editor-code">{item.codigo}</span>
          <label className="nx-object-check">
            <input
              type="checkbox"
              aria-label={`Selecionar ${item.codigo}`}
              checked={checked}
              onChange={(e) => onToggle(item.id, e.target.checked)}
            />
            <span>Selecionar</span>
          </label>
        </>
      }
    >
      <p className="nx-object-meta">
        {item.unidade} · {item.fabricante ?? "Fabricante não informado"}
      </p>
      <div className="nx-product-sourcing">
        <span className="capitalize">{item.modalidade}</span>
        <p
          className={
            supplier === "Sem fornecedor definido" ? "nx-object-problems" : "nx-object-meta"
          }
        >
          {supplier}
        </p>
      </div>
      <dl className="nx-product-price">
        <dt>Preço unitário calculado</dt>
        <dd>{price}</dd>
        {cost !== null && (
          <>
            <dt>Custo adotado nesta revisão</dt>
            <dd className="nx-product-cost">{cost}</dd>
          </>
        )}
      </dl>
      <details className="nx-object-details">
        <summary>Identificação fiscal</summary>
        <p>NCM {item.ncm ?? "não informado"}</p>
      </details>
      <button
        type="button"
        className="nx-card-primary"
        aria-label={`${editable ? "Editar" : "Consultar"} item ${item.codigo}`}
        aria-expanded={selected}
        onClick={(e) => onInspect(item.id, e.currentTarget)}
      >
        {editable ? "Editar item" : "Consultar item"}
        <span aria-hidden="true">↗</span>
      </button>
    </ObjectCard>
  );
});
