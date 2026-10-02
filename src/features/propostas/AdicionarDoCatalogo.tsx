import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useId, useMemo, useState } from "react";
import { Plus, Search } from "lucide-react";

import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { qtd } from "@/lib/format";
import { revKeys, useSave } from "./hooks";

type Presente = { quantidade: number; incluido: boolean };
type Destino = "orcamento" | "disponivel";
type CadastroSession = {
  q: string;
  destino: Destino;
  criado: { id: string; codigo: string; descricao: string } | null;
  concluido: boolean;
  repetido: boolean;
  erro: string | null;
};
const lerQ = (v: string) => Number(v.trim().replace(",", "."));
const quantidadeValida = (v: string) =>
  v.trim() !== "" && Number.isFinite(lerQ(v)) && lerQ(v) > 0 && lerQ(v) <= 1e7;

/** One entry point; choosing a product never silently chooses its role in the revision. */
export function AdicionarDoCatalogo({
  revisaoId,
  presentes,
}: {
  revisaoId: string;
  presentes: Map<string, Presente>;
}) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<"existente" | "novo">("existente");
  const [ocupado, setOcupado] = useState(false);
  const [cadastro, setCadastro] = useState<CadastroSession>({
    q: "1",
    destino: "orcamento",
    criado: null,
    concluido: false,
    repetido: false,
    erro: null,
  });
  const perms = usePermissoes();
  const podeCadastrar = !!perms.data?.importar_catalogo;
  return (
    <Sheet
      open={aberto}
      onOpenChange={(v) => {
        if (!ocupado) setAberto(v);
      }}
    >
      <SheetTrigger asChild>
        <ActionButton>
          <Plus size={17} aria-hidden="true" /> Adicionar item
        </ActionButton>
      </SheetTrigger>
      <SheetContent
        className="nx-commercial-sheet nexus-operational nx-catalog-shell"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Adicionar item</SheetTitle>
          <SheetDescription>
            Esta revisão · escolha o produto e como ele será utilizado na proposta.
          </SheetDescription>
        </SheetHeader>
        <div className="nx-add-modes" role="group" aria-label="Origem do item">
          <button
            type="button"
            aria-pressed={modo === "existente"}
            disabled={ocupado}
            onClick={() => setModo("existente")}
          >
            <Search size={16} /> Buscar no catálogo
          </button>
          <button
            type="button"
            aria-pressed={modo === "novo"}
            disabled={!podeCadastrar || ocupado}
            onClick={() => setModo("novo")}
          >
            <Plus size={16} /> Cadastrar novo
          </button>
        </div>
        {perms.isPending && <p className="nx-editor-note">Verificando permissão de cadastro…</p>}
        {perms.isError && <ErrorState error={perms.error} onRetry={() => perms.refetch()} />}
        {perms.data && !podeCadastrar && (
          <p className="nx-editor-note">
            Seu perfil pode usar itens existentes. Cadastrar exige Engenharia, Compras ou Admin.
          </p>
        )}
        <div hidden={modo !== "existente"}>
          <BuscarExistente revisaoId={revisaoId} presentes={presentes} onBusy={setOcupado} />
        </div>
        {podeCadastrar && (
          <div hidden={modo !== "novo"}>
            <CriarNaProposta
              revisaoId={revisaoId}
              onClose={() => setAberto(false)}
              onBusy={setOcupado}
              session={cadastro}
              busy={ocupado}
              onSession={setCadastro}
            />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function useIncluir(revisaoId: string) {
  const qc = useQueryClient();
  const save = useSave();
  const incluir = useServerFn(incluirNaRevisao);
  const disponibilizar = useServerFn(adicionarComponenteRevisao);
  return useMutation({
    mutationFn: async (v: { produto_id: string; quantidade: number | null }) => {
      if (
        v.quantidade !== null &&
        (!Number.isFinite(v.quantidade) || v.quantidade <= 0 || v.quantidade > 1e7)
      )
        throw new Error("Informe uma quantidade manual maior que zero e até 10.000.000.");
      return v.quantidade === null
        ? disponibilizar({ data: { revisao_id: revisaoId, produto_id: v.produto_id } })
        : incluir({
            data: { revisao_id: revisaoId, produto_id: v.produto_id, quantidade: v.quantidade },
          });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: revKeys.all(revisaoId) });
      void save.requestCalculation();
    },
  });
}

function DestinoItem({
  value,
  onChange,
  disabled,
}: {
  value: Destino;
  onChange: (v: Destino) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <fieldset className="nx-add-destination" disabled={disabled}>
      <legend>Como utilizar nesta revisão</legend>
      <label>
        <input
          type="radio"
          name={id}
          checked={value === "orcamento"}
          onChange={() => onChange("orcamento")}
        />
        <span>
          <strong>Incluir no orçamento</strong>
          <small>Usar a quantidade manual informada, além do dimensionamento.</small>
        </span>
      </label>
      <label>
        <input
          type="radio"
          name={id}
          checked={value === "disponivel"}
          onChange={() => onChange("disponivel")}
        />
        <span>
          <strong>Somente disponibilizar nesta revisão</strong>
          <small>Copiar o item para a revisão, sem incluí-lo no orçamento.</small>
        </span>
      </label>
    </fieldset>
  );
}

function Quantidade({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const valida = quantidadeValida(value);
  return (
    <label className="nx-editor-field nx-add-quantity">
      Quantidade manual
      <input
        aria-label="Quantidade manual a incluir no orçamento"
        inputMode="decimal"
        className="nx-editor-input"
        value={value}
        disabled={disabled}
        aria-invalid={!valida}
        onChange={(e) => onChange(e.target.value)}
      />
      {!valida && (
        <span className="nx-editor-error" role="alert">
          Informe um valor maior que zero e até 10.000.000.
        </span>
      )}
    </label>
  );
}

function BuscarExistente({
  revisaoId,
  presentes,
  onBusy,
}: {
  revisaoId: string;
  presentes: Map<string, Presente>;
  onBusy: (busy: boolean) => void;
}) {
  const cat = useCatalogo();
  const fam = useFamiliasCodigo();
  const [busca, setBusca] = useState("");
  const [limite, setLimite] = useState(30);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [q, setQ] = useState("1");
  const [destino, setDestino] = useState<Destino>("orcamento");
  const m = useIncluir(revisaoId);
  const lista = useMemo(
    () => filtrarCatalogo(cat.data ?? [], busca, fam.data ?? []),
    [cat.data, busca, fam.data],
  );
  const produto = cat.data?.find((p) => p.id === selecionado);
  const existente = produto ? presentes.get(produto.id) : undefined;
  const incluirNoOrcamento = !!existente || destino === "orcamento";
  const confirmar = async () => {
    if (!produto || (incluirNoOrcamento && !quantidadeValida(q))) return;
    onBusy(true);
    try {
      await m.mutateAsync({
        produto_id: produto.id,
        quantidade: incluirNoOrcamento ? lerQ(q) : null,
      });
    } catch {
      /* Mutation keeps the attempted values and server error. */
    } finally {
      onBusy(false);
    }
  };
  return (
    <div className="nx-add-search">
      <label className="nx-editor-field">
        Buscar produto
        <input
          type="search"
          placeholder="Nome, código atual ou antigo, grupo ou medida"
          className="nx-editor-input"
          value={busca}
          onChange={(e) => {
            setBusca(e.target.value);
            setLimite(30);
          }}
        />
      </label>
      {cat.isPending ? (
        <LoadingState />
      ) : cat.isError ? (
        <ErrorState error={cat.error} onRetry={() => cat.refetch()} />
      ) : (
        <>
          <p className="nx-editor-note">
            {lista.length} {lista.length === 1 ? "resultado" : "resultados"}
          </p>
          {!lista.length ? (
            <EmptyState
              title={cat.data.length ? "Nenhum produto encontrado" : "O catálogo ainda está vazio"}
              hint={
                cat.data.length
                  ? "Tente outro nome ou código."
                  : "Cadastre um produto para utilizar nesta revisão."
              }
              action={
                busca ? (
                  <ActionButton variant="ghost" onClick={() => setBusca("")}>
                    Limpar busca
                  </ActionButton>
                ) : undefined
              }
            />
          ) : (
            <ul className="nx-add-results">
              {lista.slice(0, limite).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    disabled={m.isPending}
                    aria-pressed={selecionado === p.id}
                    onClick={() => {
                      setSelecionado(p.id);
                      setQ(String(presentes.get(p.id)?.quantidade || 1));
                      setDestino("orcamento");
                      m.reset();
                    }}
                  >
                    <strong>{p.descricao}</strong>
                    <code>{p.codigo}</code>
                    <span>
                      {p.tipo_item ? nomeTipo(p.tipo_item) : "Tipo pendente"} · {p.unidade}
                      {presentes.has(p.id) ? " · já nesta revisão" : ""}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {lista.length > limite && (
            <ActionButton variant="ghost" onClick={() => setLimite((v) => v + 30)}>
              Mostrar mais produtos
            </ActionButton>
          )}
        </>
      )}
      {produto && (
        <section className="nx-add-confirm" aria-label={`Utilizar ${produto.descricao}`}>
          <h3>{produto.descricao}</h3>
          <code>{produto.codigo}</code>
          {existente && (
            <p className="nx-editor-note">
              Já nesta revisão · quantidade manual atual:{" "}
              <strong>{qtd(existente.quantidade, produto.unidade)}</strong>.{" "}
              {existente.incluido ? "Incluído no orçamento." : "Disponível, fora do orçamento."}
            </p>
          )}
          {existente ? (
            <p className="nx-editor-note">
              A confirmação substitui a quantidade manual atual e inclui o item no orçamento. O
              dimensionamento é preservado.
            </p>
          ) : (
            <DestinoItem value={destino} onChange={setDestino} disabled={m.isPending} />
          )}
          {incluirNoOrcamento && <Quantidade value={q} onChange={setQ} disabled={m.isPending} />}
          {m.isError && (
            <p className="nx-editor-error" role="alert">
              {m.error.message}
            </p>
          )}
          {m.isSuccess && (
            <p className="nx-editor-note" role="status">
              {m.variables?.quantidade !== null
                ? "Quantidade manual registrada nesta revisão."
                : m.data && "repetido" in m.data && m.data.repetido
                  ? "Item já existente nesta revisão; situação preservada."
                  : "Item disponível nesta revisão, fora do orçamento."}{" "}
              Acompanhe o recálculo no estado global de salvamento.
            </p>
          )}
          <ActionButton
            disabled={m.isPending || (incluirNoOrcamento && !quantidadeValida(q))}
            onClick={confirmar}
          >
            {m.isPending
              ? "Registrando…"
              : existente
                ? "Atualizar quantidade manual"
                : destino === "orcamento"
                  ? "Incluir no orçamento"
                  : "Disponibilizar nesta revisão"}
          </ActionButton>
        </section>
      )}
    </div>
  );
}

function CriarNaProposta({
  revisaoId,
  onClose,
  onBusy,
  session,
  busy,
  onSession,
}: {
  revisaoId: string;
  onClose: () => void;
  onBusy: (busy: boolean) => void;
  session: CadastroSession;
  busy: boolean;
  onSession: (value: CadastroSession | ((previous: CadastroSession) => CadastroSession)) => void;
}) {
  const { q, destino, criado, concluido, repetido, erro } = session;
  const setQ = (q: string) => onSession((v) => ({ ...v, q }));
  const setDestino = (destino: Destino) => onSession((v) => ({ ...v, destino }));
  const m = useIncluir(revisaoId);
  const valida = destino === "disponivel" || quantidadeValida(q);
  const tentar = async (id: string) => {
    if (!valida) return;
    onBusy(true);
    try {
      const resultado = await m.mutateAsync({
        produto_id: id,
        quantidade: destino === "orcamento" ? lerQ(q) : null,
      });
      onSession((v) => ({
        ...v,
        concluido: true,
        repetido: "repetido" in resultado && resultado.repetido,
        erro: null,
      }));
    } catch (error) {
      onSession((v) => ({
        ...v,
        erro: error instanceof Error ? error.message : "Falha ao incluir o item.",
      }));
    } finally {
      onBusy(false);
    }
  };
  return (
    <div className="nx-add-create">
      <DestinoItem
        value={destino}
        onChange={setDestino}
        disabled={busy || m.isPending || concluido}
      />
      {destino === "orcamento" && (
        <Quantidade value={q} onChange={setQ} disabled={busy || m.isPending || concluido} />
      )}
      {criado ? (
        <section className="nx-add-confirm" aria-label="Resultado do cadastro">
          <p role="status">
            Produto cadastrado: <strong>{criado.descricao}</strong>
          </p>
          <code>{criado.codigo}</code>
          {m.isPending && <p className="nx-editor-note">Registrando o item na revisão…</p>}
          {concluido && (
            <p className="nx-editor-note" role="status">
              {destino === "orcamento"
                ? "Incluído no orçamento desta revisão."
                : repetido
                  ? "Item já existente nesta revisão; situação preservada."
                  : "Disponível nesta revisão, fora do orçamento."}{" "}
              Acompanhe o recálculo no estado global de salvamento.
            </p>
          )}
          {!concluido && !m.isPending && (
            <div>
              {erro && (
                <p className="nx-editor-error" role="alert">
                  O cadastro foi salvo, mas o registro na revisão falhou: {erro}
                </p>
              )}
              <p className="nx-editor-note">Retome a inclusão com o mesmo produto e código.</p>
              <ActionButton disabled={!valida || m.isPending} onClick={() => tentar(criado.id)}>
                Tentar inclusão novamente
              </ActionButton>
            </div>
          )}
          <div className="nx-add-actions">
            {concluido && (
              <ActionButton
                variant="ghost"
                onClick={() => {
                  onSession({
                    q: "1",
                    destino: "orcamento",
                    criado: null,
                    concluido: false,
                    repetido: false,
                    erro: null,
                  });
                  m.reset();
                }}
              >
                Cadastrar outro
              </ActionButton>
            )}
            <ActionButton variant="ghost" disabled={m.isPending} onClick={onClose}>
              Concluir
            </ActionButton>
          </div>
        </section>
      ) : (
        <ProductEditor
          compacto
          onBusyChange={onBusy}
          submitDisabled={!valida}
          submitHint={!valida ? "Corrija a quantidade manual antes de cadastrar." : undefined}
          rotuloSalvar={
            destino === "orcamento"
              ? "Cadastrar e incluir no orçamento"
              : "Cadastrar e disponibilizar"
          }
          onCancel={onClose}
          onSaved={async (r) => {
            onSession((v) => ({ ...v, criado: r }));
            await tentar(r.id);
          }}
        />
      )}
    </div>
  );
}
