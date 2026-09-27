import { memo } from "react";

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

/** Only presentation: domain formatting and actions remain with the revision editor. */
export const CommercialItemRow = memo(function CommercialItemRow({
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
    <tr role="row" data-selected={selected}>
      <td role="cell" className="nx-record-check">
        <label className="nx-editor-check">
          <input
            type="checkbox"
            aria-label={`Selecionar ${item.codigo}`}
            checked={checked}
            onChange={(event) => onToggle(item.id, event.target.checked)}
          />
        </label>
      </td>
      <CommercialItemCells
        item={item}
        selected={selected}
        editable={editable}
        supplier={supplier}
        cost={cost}
        price={price}
        onInspect={onInspect}
      />
    </tr>
  );
});

/** Bulk selection updates checkbox cells while the description and values stay stable. */
const CommercialItemCells = memo(function CommercialItemCells({
  item,
  selected,
  editable,
  supplier,
  cost,
  price,
  onInspect,
}: Omit<CommercialRowProps, "checked" | "onToggle">) {
  return (
    <>
      <td role="cell" className="nx-editor-identity-cell">
        <span className="nx-editor-code">{item.codigo}</span>
        <span className="nx-editor-description">{item.descricao}</span>
        <span className="nx-editor-meta">
          {item.fabricante ?? "Fabricante não informado"} · NCM {item.ncm ?? "—"}
        </span>
        <button
          className="nx-editor-link"
          aria-label={`${editable ? "Editar" : "Consultar"} item ${item.codigo}`}
          aria-expanded={selected}
          onClick={(event) => onInspect(item.id, event.currentTarget)}
        >
          {editable ? "Editar / ver preço" : "Ver item e preço"}
          <span aria-hidden="true">↗</span>
        </button>
      </td>
      <td role="cell" data-label="Unidade">
        {item.unidade}
      </td>
      <td role="cell" data-label="Modalidade / fornecedor">
        <span className="capitalize">{item.modalidade}</span>
        <span className="nx-editor-meta">{supplier}</span>
      </td>
      {cost !== null && (
        <td role="cell" data-label="Custo nesta revisão" data-numeric>
          {cost}
        </td>
      )}
      <td role="cell" data-label="Preço unit. (calculado)" data-numeric>
        {price}
      </td>
    </>
  );
});
