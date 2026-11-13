import { useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, ErrorState, LoadingState } from "@/components/nexus/Page";
import { CadastroEditor } from "@/features/clientes/CadastroEditor";
import { listarCadastrosCliente, obterCadastro } from "@/features/clientes/clientes.functions";
import type {
  Cadastro,
  CadastroGrupo,
  Cliente,
  Contato,
  Unidade,
} from "@/features/clientes/schemas";
import { InspecoesAnexar } from "./InspecoesAnexar";
import {
  InspecoesEditarFoto,
  InspecoesEditorDialog,
  InspecoesHistorico,
} from "./InspecoesManutencao";
import { inspecoesAtivarUnidade } from "./manutencao.functions";
import { useInspecoesChave } from "./use-inspecoes-chave";
import type { InspecoesEscopo, InspecoesUnidade } from "./ui-contract";

type Scope = { escopo: InspecoesEscopo; queryKey: readonly string[] };
type Editor = { grupo: CadastroGrupo; row: Cadastro | null; cliente: string | null };

export function InspecoesClienteCadastro({ escopo, units }: Scope & { units: InspecoesUnidade[] }) {
  const cache = useQueryClient();
  const obtain = useServerFn(obterCadastro);
  const [editor, setEditor] = useState<Editor>();
  const [clientCreated, setClientCreated] = useState<Cliente>();
  const [created, setCreated] = useState<Unidade>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const clientId = escopo.clienteId;
  const unitId = escopo.unidadeId;
  const org = escopo.organizationId;
  const refresh = () => void cache.invalidateQueries({ queryKey: ["inspecoes", org] });
  async function edit(grupo: CadastroGrupo, id: string) {
    setError(undefined);
    setLoading(true);
    try {
      const row = await obtain({ data: { organization_id: org, entidade: grupo, id } });
      setEditor({ grupo, row, cliente: clientId ?? null });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }
  function afterSave(row: Cadastro) {
    if (!editor?.row && editor?.grupo === "clientes" && "razao_social" in row)
      setClientCreated(row);
    if (!editor?.row && editor?.grupo === "unidades" && "distancia_ida_volta_km" in row)
      setCreated(row);
    setEditor(undefined);
    refresh();
  }
  return (
    <section className="insp-stack" aria-label="Gestão de clientes e unidades">
      <div className="insp-work-head">
        <h3 className="insp-subheading">Cadastro e acervo da unidade</h3>
        <div className="insp-actions">
          <ActionButton
            variant="ghost"
            onClick={() => setEditor({ grupo: "clientes", row: null, cliente: null })}
          >
            Novo cliente
          </ActionButton>
          {clientId && (
            <ActionButton
              variant="ghost"
              loading={loading}
              onClick={() => void edit("clientes", clientId)}
            >
              Editar cliente
            </ActionButton>
          )}
          {clientId && (
            <ActionButton
              variant="ghost"
              onClick={() => setEditor({ grupo: "unidades", row: null, cliente: clientId })}
            >
              Nova unidade
            </ActionButton>
          )}
          {unitId && (
            <ActionButton
              variant="ghost"
              loading={loading}
              onClick={() => void edit("unidades", unitId)}
            >
              Editar unidade
            </ActionButton>
          )}
          <InspecoesEditorDialog
            label="Incluir unidade existente"
            title="Incluir unidade em Inspeções"
            description="Escolha uma unidade do cadastro Nexus e defina seu segmento."
          >
            {(dialog) => (
              <AtivarForm
                org={org}
                preferido={clientId}
                units={units}
                onSaved={refresh}
                {...dialog}
              />
            )}
          </InspecoesEditorDialog>
        </div>
      </div>
      {error != null && <ErrorState error={error} />}
      {clientCreated && (
        <div className="insp-work-head" role="status">
          <p>{clientCreated.nome_exibicao || clientCreated.razao_social} cadastrado na Nexus.</p>
          <ActionButton
            variant="ghost"
            onClick={() => setEditor({ grupo: "unidades", row: null, cliente: clientCreated.id })}
          >
            Criar unidade para este cliente
          </ActionButton>
        </div>
      )}
      {created && !units.some((row) => row.unidade_id === created.id) && (
        <div className="insp-work-head">
          <p>{created.nome} cadastrada. Inclua a unidade para usá-la em Inspeções.</p>
          <InspecoesEditorDialog
            label="Incluir esta unidade"
            title="Incluir unidade em Inspeções"
            description={created.nome}
          >
            {(dialog) => (
              <AtivarForm org={org} pronta={created} units={units} onSaved={refresh} {...dialog} />
            )}
          </InspecoesEditorDialog>
        </div>
      )}
      {editor && (
        <CadastroEditor
          org={org}
          grupo={editor.grupo}
          cliente={editor.cliente}
          row={editor.row}
          onClose={() => setEditor(undefined)}
          onSaved={afterSave}
        />
      )}
    </section>
  );
}

export function InspecoesContatosCadastrados({ escopo, queryKey }: Scope) {
  const cache = useQueryClient();
  const list = useServerFn(listarCadastrosCliente);
  const obtain = useServerFn(obterCadastro);
  const [contacts, setContacts] = useState(false);
  const [contactPage, setContactPage] = useState(0);
  const [editor, setEditor] = useState<Editor>();
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const org = escopo.organizationId;
  const clientId = escopo.clienteId;
  const query = useQuery({
    queryKey: [...queryKey, "cadastro", "contatos", clientId, contactPage],
    enabled: !!clientId && contacts,
    queryFn: ({ signal }) =>
      list({
        data: {
          organization_id: org,
          grupo: "contatos",
          cliente_id: clientId ?? null,
          busca: "",
          situacao: "ativos",
          pagina: contactPage,
          limite: 25,
        },
        signal,
      }),
  });
  const rows = (query.data?.rows ?? []) as Contato[];
  async function edit(grupo: CadastroGrupo, id: string) {
    setError(undefined);
    setLoading(true);
    try {
      const row = await obtain({ data: { organization_id: org, entidade: grupo, id } });
      setEditor({ grupo, row, cliente: clientId ?? null });
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }
  return (
    <>
      {clientId && (
        <details onToggle={(event) => setContacts(event.currentTarget.open)}>
          <summary>Contatos cadastrados</summary>
          <div className="insp-stack">
            <ActionButton
              variant="ghost"
              onClick={() => setEditor({ grupo: "contatos", row: null, cliente: clientId })}
            >
              Novo contato
            </ActionButton>
            {contacts && query.isPending && <LoadingState label="Carregando contatos…" />}
            {query.isError && (
              <ErrorState error={query.error} onRetry={() => void query.refetch()} />
            )}
            {query.data && rows.length === 0 && <p>Nenhum contato cadastrado.</p>}
            {rows.map((row) => (
              <div className="insp-work-head" key={row.id}>
                <p>
                  {row.nome}
                  {row.cargo ? ` · ${row.cargo}` : ""}
                  {row.email ? ` · ${row.email}` : ""}
                </p>
                <ActionButton
                  variant="ghost"
                  loading={loading}
                  onClick={() => void edit("contatos", row.id)}
                >
                  Editar contato
                </ActionButton>
              </div>
            ))}
            {(contactPage > 0 || (query.data?.total ?? 0) > (contactPage + 1) * 25) && (
              <div className="insp-actions">
                <ActionButton
                  variant="ghost"
                  disabled={contactPage === 0}
                  onClick={() => setContactPage((p) => p - 1)}
                >
                  Contatos anteriores
                </ActionButton>
                <ActionButton
                  variant="ghost"
                  disabled={(query.data?.total ?? 0) <= (contactPage + 1) * 25}
                  onClick={() => setContactPage((p) => p + 1)}
                >
                  Mais contatos
                </ActionButton>
              </div>
            )}
          </div>
        </details>
      )}
      {error != null && <ErrorState error={error} />}
      {editor && (
        <CadastroEditor
          org={org}
          grupo={editor.grupo}
          cliente={editor.cliente}
          row={editor.row}
          onClose={() => setEditor(undefined)}
          onSaved={() => {
            setEditor(undefined);
            void cache.invalidateQueries({ queryKey: ["inspecoes", org] });
          }}
        />
      )}
    </>
  );
}

export function UnidadeAcervo({
  escopo,
  queryKey,
  id,
  clienteId,
  name,
  edit,
}: Scope & { id: string; clienteId: string; name: string; edit: boolean }) {
  const [open, setOpen] = useState(false);
  const cache = useQueryClient();
  const refresh = () => void cache.invalidateQueries({ queryKey });
  return (
    <details onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>Arquivos e histórico da unidade</summary>
      {open && (
        <div className="insp-stack">
          <InspecoesAnexar
            escopo={escopo}
            queryKey={queryKey}
            alvo={{ tipo: "unidade", id }}
            edit={edit}
            tag={name}
            atualizar={refresh}
            acoesArquivo={
              edit
                ? (file) => (
                    <InspecoesEditarFoto
                      organizationId={escopo.organizationId}
                      file={file}
                      onSaved={refresh}
                    />
                  )
                : undefined
            }
          />
          <InspecoesHistorico
            organizationId={escopo.organizationId}
            tipo="unidade"
            id={id}
            clienteId={clienteId}
            queryKey={queryKey}
          />
        </div>
      )}
    </details>
  );
}

function AtivarForm({
  org,
  preferido,
  pronta,
  units,
  onSaved,
  close,
  setBusy,
}: {
  org: string;
  preferido?: string | undefined;
  pronta?: Unidade;
  units: InspecoesUnidade[];
  onSaved: () => void;
  close: () => void;
  setBusy: (busy: boolean) => void;
}) {
  const list = useServerFn(listarCadastrosCliente);
  const activate = useServerFn(inspecoesAtivarUnidade);
  const key = useInspecoesChave();
  const [client, setClient] = useState(pronta?.cliente_id ?? preferido ?? "");
  const [unit, setUnit] = useState(pronta?.id ?? "");
  const [search, setSearch] = useState("");
  const [unitSearch, setUnitSearch] = useState("");
  const [error, setError] = useState<unknown>();
  const [saving, setSaving] = useState(false);
  const clients = useQuery({
    queryKey: ["inspecoes", org, "ativacao", "clientes", search],
    enabled: !pronta,
    queryFn: ({ signal }) =>
      list({
        data: {
          organization_id: org,
          grupo: "clientes",
          cliente_id: null,
          busca: search,
          situacao: "ativos",
          pagina: 0,
          limite: 50,
        },
        signal,
      }),
  });
  const options = useQuery({
    queryKey: ["inspecoes", org, "ativacao", "unidades", client, unitSearch],
    enabled: !pronta && Boolean(client),
    queryFn: ({ signal }) =>
      list({
        data: {
          organization_id: org,
          grupo: "unidades",
          cliente_id: client,
          busca: unitSearch,
          situacao: "ativos",
          pagina: 0,
          limite: 50,
        },
        signal,
      }),
  });
  const available = ((options.data?.rows ?? []) as Unidade[]).filter(
    (row) => !units.some((enabled) => enabled.unidade_id === row.id),
  );
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !client || !unit) return;
    const fields = new FormData(event.currentTarget);
    const segmento = fields.get("segmento");
    if (segmento !== "CC" && segmento !== "AG-A" && segmento !== "AG-B" && segmento !== "IN")
      return;
    const data = {
      organizationId: org,
      clienteId: client,
      unidadeId: unit,
      segmento: segmento as "CC" | "AG-A" | "AG-B" | "IN",
      motivo: String(fields.get("motivo") ?? "").trim(),
    };
    setError(undefined);
    setSaving(true);
    setBusy(true);
    try {
      await activate({ data: { ...data, chave: key(data) } });
      onSaved();
      close();
    } catch (err) {
      setError(err);
    } finally {
      setSaving(false);
      setBusy(false);
    }
  }
  return (
    <form className="insp-stack" onSubmit={(event) => void submit(event)}>
      {!pronta && (
        <>
          <label className="insp-field">
            Buscar cliente
            <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} />
          </label>
          <label className="insp-field">
            Cliente
            <select
              value={client}
              required
              onChange={(e) => {
                setClient(e.target.value);
                setUnit("");
                setUnitSearch("");
              }}
            >
              <option value="">Selecione</option>
              {client && !clients.data?.rows.some((r) => r.id === client) && (
                <option value={client}>Cliente em uso</option>
              )}
              {((clients.data?.rows ?? []) as Cliente[]).map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nome_exibicao || row.razao_social}
                </option>
              ))}
            </select>
          </label>
          <label className="insp-field">
            Buscar unidade
            <input
              type="search"
              value={unitSearch}
              disabled={!client}
              onChange={(e) => {
                setUnitSearch(e.target.value);
                setUnit("");
              }}
            />
          </label>
          <label className="insp-field">
            Unidade
            <select
              value={unit}
              disabled={!client}
              required
              onChange={(e) => setUnit(e.target.value)}
            >
              <option value="">Selecione</option>
              {available.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.nome}
                </option>
              ))}
            </select>
          </label>
          {client && options.isSuccess && !available.length && (
            <p>Nenhuma unidade ativa disponível para incluir com esse filtro.</p>
          )}
          {(clients.isFetching || options.isFetching) && (
            <p role="status">Consultando cadastros…</p>
          )}
          {(clients.isError || options.isError) && (
            <ErrorState
              error={clients.error ?? options.error}
              onRetry={() => {
                void clients.refetch();
                if (client) void options.refetch();
              }}
            />
          )}
        </>
      )}
      <label className="insp-field">
        Segmento
        <select name="segmento" defaultValue="" required>
          <option value="" disabled>
            Selecione
          </option>
          <option value="CC">Construção civil (CC)</option>
          <option value="AG-A">Agroindústria A</option>
          <option value="AG-B">Agroindústria B</option>
          <option value="IN">Indústria (IN)</option>
        </select>
      </label>
      <label className="insp-field">
        Motivo
        <textarea name="motivo" minLength={5} maxLength={2000} rows={2} required />
      </label>
      {error != null && <ErrorState error={error} />}
      <ActionButton type="submit" loading={saving} disabled={!client || !unit}>
        Incluir unidade
      </ActionButton>
    </form>
  );
}
