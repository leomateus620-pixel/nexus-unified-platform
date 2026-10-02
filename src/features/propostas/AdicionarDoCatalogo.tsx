import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import {
  adicionarComponenteRevisao,
  incluirNaRevisao,
} from "@/features/catalogo/catalogo.functions";
import { nomeTipo } from "@/features/catalogo/codigos";
import {
  ProductEditor,
  filtrarCatalogo,
  useCatalogo,
  useFamiliasCodigo,
  usePermissoes,
} from "@/features/catalogo/ProductEditor";
import { revKeys, useSave } from "./hooks";

type Modo = null | "existente" | "novo" | "novo-incluir";
const btn =
  "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm disabled:opacity-50";

/** Ações de catálogo dentro da proposta: nada entra no orçamento sem ação explícita. */
export function AdicionarDoCatalogo({
  revisaoId,
  presentes,
}: {
  revisaoId: string;
  presentes: Set<string>;
}) {
  const [modo, setModo] = useState<Modo>(null);
  const perms = usePermissoes();
  const podeCadastrar = !!perms.data?.importar_catalogo;
  const motivo = "Cadastrar produto novo exige papel Engenharia, Compras ou Admin.";
  return (
    <div className="mb-3 grid gap-2">
      <div className="flex flex-wrap gap-2" role="toolbar" aria-label="Ações do catálogo">
        <button
          type="button"
          aria-pressed={modo === "existente"}
          className={`${btn} border-border`}
          onClick={() => setModo(modo === "existente" ? null : "existente")}
        >
          <Search size={14} /> Adicionar item existente
        </button>
        <button
          type="button"
          aria-pressed={modo === "novo"}
          disabled={!podeCadastrar}
          title={podeCadastrar ? undefined : motivo}
          className={`${btn} border-border`}
          onClick={() => setModo(modo === "novo" ? null : "novo")}
        >
          <Plus size={14} /> Criar novo item
        </button>
        <button
          type="button"
          aria-pressed={modo === "novo-incluir"}
          disabled={!podeCadastrar}
          title={podeCadastrar ? undefined : motivo}
          className={`${btn} border-primary/60 text-primary`}
          onClick={() => setModo(modo === "novo-incluir" ? null : "novo-incluir")}
        >
          <Plus size={14} /> Criar e adicionar à proposta
        </button>
      </div>
      {perms.data && !podeCadastrar && (
        <p className="text-xs text-muted-foreground">
          {motivo} Você ainda pode adicionar itens existentes.
        </p>
      )}
      {modo === "existente" && (
        <BuscarExistente
          revisaoId={revisaoId}
          presentes={presentes}
          onClose={() => setModo(null)}
        />
      )}
      {(modo === "novo" || modo === "novo-incluir") && (
        <CriarNaProposta
          revisaoId={revisaoId}
          incluir={modo === "novo-incluir"}
          onClose={() => setModo(null)}
        />
      )}
    </div>
  );
}

function useIncluir(revisaoId: string) {
  const qc = useQueryClient();
  const save = useSave();
  const incluir = useServerFn(incluirNaRevisao);
  const disponibilizar = useServerFn(adicionarComponenteRevisao);
  return useMutation({
    mutationFn: async (v: { produto_id: string; quantidade: number | null }) =>
      v.quantidade === null
        ? disponibilizar({ data: { revisao_id: revisaoId, produto_id: v.produto_id } })
        : incluir({
            data: { revisao_id: revisaoId, produto_id: v.produto_id, quantidade: v.quantidade },
          }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: revKeys.all(revisaoId) });
      // O cálculo canônico roda pelo coordenador de salvamento (estado visível na tela).
      void save.requestCalculation();
    },
  });
}

function Quantidade({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-1 text-xs text-muted-foreground">
      Quantidade
      <input
        aria-label="Quantidade a incluir no orçamento"
        inputMode="decimal"
        className="h-8 w-20 rounded border border-input bg-background px-2 text-right text-sm text-foreground"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
const lerQ = (v: string) => Number(v.trim().replace(",", "."));

function BuscarExistente({
  revisaoId,
  presentes,
  onClose,
}: {
  revisaoId: string;
  presentes: Set<string>;
  onClose: () => void;
}) {
  const cat = useCatalogo();
  const fam = useFamiliasCodigo();
  const [busca, setBusca] = useState("");
  const [q, setQ] = useState<Record<string, string>>({});
  const m = useIncluir(revisaoId);
  const lista = useMemo(
    () => filtrarCatalogo(cat.data ?? [], busca, fam.data ?? []).slice(0, 30),
    [cat.data, busca, fam.data],
  );
  return (
    <div className="rounded border border-border p-3">
      <div className="mb-2 flex gap-2">
        <input
          autoFocus
          aria-label="Buscar no catálogo"
          placeholder="Nome, código (novo ou antigo), família ou medida"
          className="h-9 flex-1 rounded border border-input bg-background px-2 text-sm text-foreground"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />
        <button type="button" className="text-sm text-muted-foreground" onClick={onClose}>
          Fechar
        </button>
      </div>
      {cat.isLoading && <p className="text-sm text-muted-foreground">Carregando catálogo…</p>}
      <ul className="max-h-80 divide-y divide-border overflow-y-auto">
        {lista.map((p) => {
          const qv = q[p.id] ?? "1";
          const valida = Number.isFinite(lerQ(qv)) && lerQ(qv) > 0;
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
              <span className="min-w-0 flex-1">
                <span className="block text-sm text-foreground">{p.descricao}</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {p.codigo} · {p.tipo_item ? nomeTipo(p.tipo_item) : "Código pendente"}
                  {p.tipo_item !== "P" &&
                    p.tipo_item &&
                    (p.composicao_status === "definida"
                      ? " · com composição"
                      : " · composição pendente")}
                  {presentes.has(p.id) && " · já na revisão"}
                </span>
              </span>
              <Quantidade value={qv} onChange={(v) => setQ((x) => ({ ...x, [p.id]: v }))} />
              <button
                type="button"
                disabled={m.isPending || !valida}
                className="rounded border border-primary/50 px-2 py-1 text-xs text-primary disabled:opacity-50"
                onClick={() => m.mutate({ produto_id: p.id, quantidade: lerQ(qv) })}
              >
                Incluir no orçamento
              </button>
              {!presentes.has(p.id) && (
                <button
                  type="button"
                  disabled={m.isPending}
                  className="rounded border border-border px-2 py-1 text-xs text-muted-foreground disabled:opacity-50"
                  onClick={() => m.mutate({ produto_id: p.id, quantidade: null })}
                >
                  Só disponibilizar na revisão
                </button>
              )}
            </li>
          );
        })}
      </ul>
      {m.isError && <p className="mt-2 text-sm text-destructive">{(m.error as Error).message}</p>}
      {m.isSuccess && (
        <p className="mt-2 text-sm text-primary" role="status">
          Item registrado na revisão (rascunho salvo). O recálculo aparece no estado de salvamento.
        </p>
      )}
    </div>
  );
}

function CriarNaProposta({
  revisaoId,
  incluir,
  onClose,
}: {
  revisaoId: string;
  incluir: boolean;
  onClose: () => void;
}) {
  const [q, setQ] = useState("1");
  const [criado, setCriado] = useState<{ id: string; codigo: string; descricao: string } | null>(
    null,
  );
  const m = useIncluir(revisaoId);
  const quantidade = incluir ? lerQ(q) : null;
  const tentar = (id: string) =>
    m.mutateAsync({ produto_id: id, quantidade }).catch(() => undefined);
  return (
    <div className="rounded border border-border p-3">
      {incluir && (
        <div className="mb-3">
          <Quantidade value={q} onChange={setQ} />
        </div>
      )}
      {criado ? (
        <div className="grid gap-2 text-sm">
          <p className="text-primary">
            Produto cadastrado: <strong>{criado.descricao}</strong>{" "}
            <span className="font-mono">{criado.codigo}</span>.
          </p>
          {m.isPending && <p className="text-muted-foreground">Incluindo na proposta…</p>}
          {m.isSuccess && (
            <p className="text-primary">
              {incluir
                ? "Incluído no orçamento desta proposta."
                : "Disponível no catálogo desta revisão."}
            </p>
          )}
          {m.isError && (
            <p className="text-destructive">
              O cadastro foi salvo, mas a inclusão na proposta falhou: {(m.error as Error).message}{" "}
              <button type="button" className="underline" onClick={() => tentar(criado.id)}>
                Tentar incluir novamente
              </button>{" "}
              (não cria outro produto nem consome outro código)
            </p>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              className={`${btn} border-border`}
              onClick={() => {
                setCriado(null);
                m.reset();
              }}
            >
              Cadastrar outro
            </button>
            <button type="button" className={`${btn} border-border`} onClick={onClose}>
              Concluir
            </button>
          </div>
        </div>
      ) : (
        <ProductEditor
          compacto
          rotuloSalvar={
            incluir ? "Cadastrar e incluir na proposta" : "Cadastrar e disponibilizar na revisão"
          }
          onCancel={onClose}
          onSaved={async (r) => {
            setCriado(r);
            if (incluir && !(quantidade! > 0)) return;
            await tentar(r.id);
          }}
        />
      )}
    </div>
  );
}
