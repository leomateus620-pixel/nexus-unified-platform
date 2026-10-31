import { useState } from "react";
import type { ClienteMarca } from "@/features/clientes/schemas";
import { marcaImagem, marcaMonograma } from "@/features/clientes/marca";
import "./client-brand.css";

export type NrClientIdentity = {
  id: string;
  nome: string;
  marca?: ClienteMarca | null | undefined;
};

export function NrClientBrand({
  client,
  compact = false,
}: {
  client: NrClientIdentity;
  compact?: boolean;
}) {
  const src = marcaImagem(client.marca);
  const [failed, setFailed] = useState<string | null>(null);
  return (
    <span className={`nr-brand${compact ? " nr-brand-compact" : ""}`}>
      <span
        className="nr-brand-media"
        data-surface={src && failed !== src ? client.marca?.superficie : "clara"}
        aria-hidden="true"
      >
        {src && failed !== src ? (
          <img
            src={src}
            alt=""
            width={client.marca?.largura}
            height={client.marca?.altura}
            onError={() => setFailed(src)}
            decoding="async"
          />
        ) : (
          <span className="nr-brand-monogram">{marcaMonograma(client.nome)}</span>
        )}
      </span>
      <span className="nr-brand-name">{client.nome}</span>
    </span>
  );
}
