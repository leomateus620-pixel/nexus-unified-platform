import { Box, Cable, Factory, House, PackageCheck, Route, Truck } from "lucide-react";
import { useId, useState, type ReactNode } from "react";
import { ActionButton, StatusBadge } from "@/components/nexus/Page";
import "./catalog.css";

export function ObjectCollection({
  children,
  label,
  className = "",
}: {
  children: ReactNode;
  label: string;
  className?: string;
}) {
  return (
    <ul className={`nx-object-collection ${className}`} aria-label={label}>
      {children}
    </ul>
  );
}

export function ObjectCard({
  title,
  eyebrow,
  selected,
  children,
  className = "",
  titleLabel,
}: {
  title: string;
  eyebrow?: ReactNode;
  selected?: boolean;
  children: ReactNode;
  className?: string;
  titleLabel?: string;
}) {
  const id = useId();
  return (
    <li className={`nx-object-card ${className}`} data-selected={selected}>
      <article aria-labelledby={id}>
        {eyebrow && <div className="nx-object-eyebrow">{eyebrow}</div>}
        <h3 id={id}>
          {titleLabel && <span className="nx-object-title-label">{titleLabel}</span>}
          {title}
        </h3>
        {selected && <span className="nx-object-selection">Em edição</span>}
        {children}
      </article>
    </li>
  );
}

/** Presentation vocabulary only: no inferred specifications or engineering geometry. */
export function FamilyMark({ description }: { description: string }) {
  const category = /cabo/i.test(description)
    ? "cabo"
    : /pilar|ancoragem/i.test(description)
      ? "estrutura"
      : "componente";
  const Icon = category === "cabo" ? Cable : category === "estrutura" ? House : Box;
  return (
    <span className="nx-family-mark" aria-hidden="true">
      <Icon size={25} strokeWidth={1.6} />
    </span>
  );
}

export function Facts({ items }: { items: [string, ReactNode][] }) {
  return (
    <dl className="nx-object-facts">
      {items.map(([name, value]) => (
        <div key={name}>
          <dt>{name}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function SystemCard({
  name,
  number,
  type,
  origin,
  selected,
  facts,
  problems,
  preview,
  children,
}: {
  name: string;
  number: number;
  type: string;
  origin: string;
  selected: boolean;
  facts: [string, ReactNode][];
  problems: string[];
  preview: boolean;
  children: ReactNode;
}) {
  const Icon = type === "TELHADO" ? House : Route;
  return (
    <ObjectCard
      className={`nx-system-card ${type === "TELHADO" ? "nx-system-roof" : "nx-system-overhead"}`}
      title={name || "Identificação pendente"}
      titleLabel="Identificação / local"
      selected={selected}
      eyebrow={
        <>
          <Icon size={26} aria-hidden="true" />
          <span className="nx-system-number">Sistema nº {number}</span>
          <span className="nx-system-type">
            {type === "TELHADO" ? "Telhado" : "Suspenso (OVERHEAD)"}
          </span>
        </>
      }
    >
      <Facts items={facts} />
      <p className="nx-object-meta nx-system-provenance" data-preview={preview}>
        <span>Origem: {origin}</span>
        <span>{preview ? "Prévia local · cálculo pendente" : "Cálculo consolidado"}</span>
      </p>
      {problems.length > 0 && (
        <ul className="nx-object-problems">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <div className="nx-object-actions">{children}</div>
    </ObjectCard>
  );
}

export function ProcurementCard({
  title,
  code,
  supplier,
  status,
  facts,
  children,
}: {
  title: string;
  code: string;
  supplier: string | null;
  status: string;
  facts: [string, ReactNode][];
  children?: ReactNode;
}) {
  return (
    <PlanningItem
      title={title}
      code={code}
      status={status}
      facts={facts}
      supplier={
        <>
          <span className="nx-object-title-label">Fornecedor</span>
          <p className={supplier ? "nx-object-meta" : "nx-planning-warning"}>
            {supplier || "Pendente: definir fornecedor no item comercial"}
          </p>
        </>
      }
      icon={<Truck size={20} aria-hidden="true" />}
    >
      {children}
    </PlanningItem>
  );
}

export function ProductionCard({
  title,
  code,
  status,
  facts,
  children,
}: {
  title: string;
  code: string;
  status: string;
  facts: [string, ReactNode][];
  children?: ReactNode;
}) {
  return (
    <PlanningItem
      title={title}
      code={code}
      status={status}
      facts={facts}
      icon={<Factory size={20} aria-hidden="true" />}
    >
      {children}
      <p className="nx-object-meta">
        Prazo, responsável e referência técnica: consulte a OP vinculada.
      </p>
    </PlanningItem>
  );
}

/** One semantic list entry at every width; quantities are formatted by Planejamento. */
function PlanningItem({
  title,
  code,
  status,
  facts,
  supplier,
  icon,
  children,
}: {
  title: string;
  code: string;
  status: string;
  facts: [string, ReactNode][];
  supplier?: ReactNode;
  icon: ReactNode;
  children?: ReactNode;
}) {
  const id = useId();
  return (
    <li className="nx-planning-row" data-purchasing={!!supplier} data-status={status}>
      <article aria-labelledby={id}>
        <div className="nx-planning-identity">
          <p className="nx-object-eyebrow">
            {icon}
            <span>{code}</span>
          </p>
          <h3 id={id}>{title}</h3>
        </div>
        {supplier && <div className="nx-planning-supplier">{supplier}</div>}
        <Facts items={facts} />
        <div className="nx-planning-status">
          <span className="nx-object-title-label">Situação</span>
          <StatusBadge value={status} />
          <div className="nx-object-actions">{children}</div>
        </div>
      </article>
    </li>
  );
}

export function RevisionCard({
  title,
  current,
  status,
  date,
  total,
  children,
}: {
  title: string;
  current: boolean;
  status: string;
  date: string;
  total: string;
  children: ReactNode;
}) {
  return (
    <ObjectCard
      title={title}
      className="nx-revision-card"
      eyebrow={
        <>
          <PackageCheck size={22} aria-hidden="true" />
          {current ? "Revisão aberta" : "Revisão formal"}
        </>
      }
    >
      <StatusBadge value={status} />
      <Facts
        items={[
          ["Total", total],
          ["Criada", date],
        ]}
      />
      {children}
    </ObjectCard>
  );
}

/** Progressive rendering is presentation-only; filtering and bulk selection use the full collection. */
export function CollectionPage<T>({
  items,
  children,
}: {
  items: T[];
  children: (items: T[]) => ReactNode;
}) {
  const [limit, setLimit] = useState(48);
  return (
    <>
      {children(items.slice(0, limit))}
      {items.length > limit && (
        <div className="nx-collection-more">
          <span>
            {limit} de {items.length} objetos exibidos
          </span>
          <ActionButton variant="ghost" onClick={() => setLimit((n) => n + 48)}>
            Mostrar mais 48
          </ActionButton>
        </div>
      )}
    </>
  );
}
