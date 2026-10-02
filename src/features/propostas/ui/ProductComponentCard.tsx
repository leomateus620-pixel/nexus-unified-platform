import { memo, type ReactNode } from "react";
import { FamilyMark, ObjectCard } from "./ObjectCards";

type ItemIdentity = {
  id: string;
  codigo: string;
  descricao: string;
  fabricante: string | null;
  ncm: string | null;
  unidade: string;
  modalidade: string;
  incluido_orcamento: boolean;
};

type CommercialRowProps = {
  item: ItemIdentity;
  selected: boolean;
  batchChecked: boolean;
  editable: boolean;
  price: string;
  quantity: string;
  pricePending?: boolean;
  extra?: ReactNode;
  onInspect: (id: string, trigger: HTMLButtonElement) => void;
  onToggleIncluded: (id: string, included: boolean) => void;
  onToggleBatch: (id: string, checked: boolean) => void;
};

/** A component is an object, with independent selection and editing controls. */
export const ProductComponentCard = memo(function ProductComponentCard({
  item,
  selected,
  batchChecked,
  editable,
  price,
  quantity,
  pricePending,
  extra,
  onInspect,
  onToggleIncluded,
  onToggleBatch,
}: CommercialRowProps) {
  return (
    <ObjectCard
      title={item.descricao}
      selected={selected}
      className="nx-product-card"
      onOpen={(trigger) => onInspect(item.id, trigger)}
      openLabel={`${editable ? "Editar" : "Consultar"} item ${item.codigo}`}
      eyebrow={
        <>
          <FamilyMark description={item.descricao} />
          <span className="nx-editor-code">{item.codigo}</span>
          <div className="nx-product-controls">
            <label className="nx-object-check">
              <input
                type="checkbox"
                aria-label={`Incluir ${item.codigo} no orçamento`}
                checked={item.incluido_orcamento}
                disabled={!editable}
                onChange={(e) => onToggleIncluded(item.id, e.target.checked)}
              />
              <span>No orçamento</span>
            </label>
          </div>
        </>
      }
    >
      <div className="nx-product-sourcing">
        <span className="capitalize">{item.modalidade}</span>
        <span>Unidade · {item.unidade}</span>
      </div>
      <dl className="nx-product-price">
        <div className="nx-product-price-main">
          <dt>{pricePending ? "Prévia unitária" : "Preço unitário"}</dt>
          <dd>{price}</dd>
        </div>
        <div className="nx-product-quantity">
          <dt>Quantidade</dt>
          <dd>{quantity}</dd>
        </div>
      </dl>
      {extra}
      <label className="nx-object-check nx-product-batch-check">
        <input
          type="checkbox"
          aria-label={`Selecionar ${item.codigo} para edição em lote`}
          checked={batchChecked}
          disabled={!editable}
          onChange={(e) => onToggleBatch(item.id, e.target.checked)}
        />
        <span>Selecionar para ação em lote</span>
      </label>
    </ObjectCard>
  );
});
