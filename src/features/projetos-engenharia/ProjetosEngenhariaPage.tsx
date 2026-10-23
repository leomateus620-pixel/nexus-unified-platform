import { useEffect, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useBlocker } from "@tanstack/react-router";
import { ArrowLeft, FileText, GitBranch, Plus, RotateCcw, RotateCw } from "lucide-react";

import {
  ActionButton,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/nexus/Page";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOrgId } from "@/features/org/session";
import { compararModelos, documentoInicial } from "./domain";
import {
  buscarOpcoesPe,
  executarProjetoEngenharia,
  listarProjetosEngenharia,
  obterConteudoPe,
  obterProjetoEngenharia,
} from "./projetos-engenharia.functions";
import { documentoNativoSchema, type ComandoPe, type DocumentoNativo } from "./schemas";
import type { PeCenario, PeDetalhe, PeResultado, PeVersao } from "./types";
import { ArquivosPe } from "./ArquivosPe";

const input =
  "min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground";
const label = "grid min-w-0 gap-1.5 text-sm text-foreground";
type Executar = (
  dados: Omit<ComandoPe, "organization_id" | "chave">,
) => Promise<PeResultado | null>;

function useDebounce(value: string) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(timer);
  }, [value]);
  return debounced;
}

function Seletor({
  tipo,
  titulo,
  valor,
  onChange,
  clienteId,
}: {
  tipo: "clientes" | "unidades" | "pessoas";
  titulo: string;
  valor: string;
  onChange: (id: string) => void;
  clienteId?: string;
}) {
  const org = useOrgId();
  const [busca, setBusca] = useState("");
  const termo = useDebounce(busca);
  const q = useQuery({
    queryKey: ["pe-opcoes", org, tipo, termo, clienteId],
    enabled: !!org && (tipo !== "unidades" || !!clienteId),
    queryFn: () =>
      buscarOpcoesPe({ data: { organization_id: org, tipo, busca: termo, cliente_id: clienteId } }),
  });
  const [selecionado, setSelecionado] = useState<{ id: string; nome: string } | null>(null);
  const opcoes = q.data ?? [];
  const lista =
    selecionado && selecionado.id === valor && !opcoes.some((x) => x.id === valor)
      ? [selecionado, ...opcoes]
      : opcoes;
  return (
    <div className="grid gap-2">
      <label className={label}>
        Buscar {titulo.toLowerCase()}
        <input
          className={input}
          value={busca}
          onChange={(event) => setBusca(event.target.value)}
          placeholder="Busca no servidor, até 25 resultados"
        />
      </label>
      <label className={label}>
        {titulo}
        {tipo !== "unidades" && " *"}
        <select
          className={input}
          value={valor}
          required={tipo !== "unidades"}
          onChange={(event) => {
            setSelecionado(lista.find((x) => x.id === event.target.value) ?? null);
            onChange(event.target.value);
          }}
        >
          <option value="">{tipo === "unidades" ? "Local ainda a confirmar" : "Selecione"}</option>
          {lista.map((row) => (
            <option key={row.id} value={row.id}>
              {row.nome}
            </option>
          ))}
        </select>
      </label>
      {q.isError && <ErrorState error={q.error} onRetry={() => q.refetch()} />}
      {!q.isPending && !q.isError && !opcoes.length && (
        <p className="text-xs text-muted-foreground">
          Nenhum cadastro encontrado. Cadastre no menu{" "}
          {tipo === "pessoas" ? "Pessoas e Competências" : "Clientes"}.
        </p>
      )}
    </div>
  );
}

function NovoProjeto({
  executar,
  busy,
  fechar,
}: {
  executar: Executar;
  busy: boolean;
  fechar: () => void;
}) {
  const [clienteId, setClienteId] = useState("");
  const [unidadeId, setUnidadeId] = useState("");
  const [pessoaId, setPessoaId] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const dados = new FormData(event.currentTarget);
    const valor = (chave: string) => String(dados.get(chave) ?? "");
    const r = await executar({
      comando: "criar",
      titulo: valor("titulo"),
      cliente_id: clienteId,
      unidade_id: unidadeId || null,
      responsavel_id: pessoaId,
      local_descritivo: valor("local"),
      descricao: valor("descricao"),
      visibilidade: valor("visibilidade") as "restrito" | "organizacao",
      elaborado_em: valor("data") || null,
      autor_declarado: valor("autor"),
      resumo: valor("resumo"),
      modelo: documentoInicial(),
    });
    if (r) fechar();
  }
  return (
    <form onSubmit={submit} className="grid gap-4">
      <fieldset disabled={busy} className="grid min-w-0 gap-4">
        <label className={label}>
          Título do projeto *
          <input name="titulo" className={input} required minLength={3} maxLength={200} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <Seletor
            tipo="clientes"
            titulo="Cliente"
            valor={clienteId}
            onChange={(id) => {
              setClienteId(id);
              setUnidadeId("");
            }}
          />
          <Seletor
            key={clienteId}
            tipo="unidades"
            titulo="Unidade"
            clienteId={clienteId}
            valor={unidadeId}
            onChange={setUnidadeId}
          />
        </div>
        {!unidadeId && (
          <label className={label}>
            Local a confirmar *
            <input name="local" className={input} required minLength={3} maxLength={1000} />
            <span className="text-xs text-muted-foreground">
              Descrição provisória; não cria uma unidade fictícia.
            </span>
          </label>
        )}
        <Seletor tipo="pessoas" titulo="Responsável" valor={pessoaId} onChange={setPessoaId} />
        <label className={label}>
          Descrição do escopo
          <textarea name="descricao" className={input} rows={3} maxLength={4000} />
        </label>
        <div className="grid gap-4 md:grid-cols-2">
          <label className={label}>
            Data original de elaboração
            <input name="data" className={input} type="date" />
          </label>
          <label className={label}>
            Autor declarado na fonte
            <input name="autor" className={input} maxLength={200} />
          </label>
        </div>
        <label className={label}>
          Descrição da primeira versão *
          <textarea
            name="resumo"
            className={input}
            required
            minLength={3}
            maxLength={2000}
            rows={2}
          />
        </label>
        <label className={label}>
          Visibilidade
          <select name="visibilidade" className={input}>
            <option value="restrito">Criador, responsável e administradores autorizados</option>
            <option value="organizacao">
              Profissionais de engenharia autorizados da organização
            </option>
          </select>
        </label>
        <p className="text-xs text-muted-foreground">
          Cria um rascunho documental nativo independente de proposta e obra. Não gera aprovação
          profissional ou autorização para executar.
        </p>
        <div className="flex flex-wrap gap-2">
          <ActionButton type="submit" loading={busy}>
            Criar projeto e V1
          </ActionButton>
          <ActionButton variant="ghost" onClick={fechar}>
            Cancelar
          </ActionButton>
        </div>
      </fieldset>
    </form>
  );
}

export function ProjetosEngenhariaPage({
  projetoId,
  selecionar,
}: {
  projetoId?: string | undefined;
  selecionar: (id?: string) => void;
}) {
  const org = useOrgId();
  const qc = useQueryClient();
  const [busca, setBusca] = useState("");
  const [pagina, setPagina] = useState(0);
  const [arquivados, setArquivados] = useState(false);
  const [novo, setNovo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const tentativa = useRef<{ payload: string; chave: string } | null>(null);
  const termo = useDebounce(busca);
  const q = useQuery({
    queryKey: ["pe", org, "lista", termo, pagina, arquivados],
    enabled: !!org && !projetoId,
    queryFn: () =>
      listarProjetosEngenharia({
        data: { organization_id: org, busca: termo, pagina, arquivados },
      }),
  });
  async function executar(
    dados: Omit<ComandoPe, "organization_id" | "chave">,
  ): Promise<PeResultado | null> {
    setBusy(true);
    setErro(null);
    setAviso(null);
    const payload = JSON.stringify(dados);
    if (tentativa.current?.payload !== payload)
      tentativa.current = { payload, chave: crypto.randomUUID() };
    try {
      const r = await executarProjetoEngenharia({
        data: { ...dados, organization_id: org, chave: tentativa.current.chave },
      });
      tentativa.current = null;
      await qc.invalidateQueries({ queryKey: ["pe", org] });
      if (dados.comando === "criar") selecionar(r.projeto.id);
      setAviso("Operação salva no servidor.");
      return r;
    } catch (error) {
      setErro(
        error instanceof Error
          ? error.message
          : "Não foi possível salvar. Seu rascunho permanece aberto.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        eyebrow="Engenharia"
        title={projetoId ? "Projeto técnico" : "Projetos de Engenharia"}
        description={
          projetoId ? "" : "Acervo, revisões e experimentos com fontes e autoria preservadas."
        }
        actions={
          !projetoId ? (
            <ActionButton
              onClick={() => {
                setErro(null);
                setNovo(true);
              }}
            >
              <Plus size={16} aria-hidden className="mr-2 inline" />
              Novo projeto
            </ActionButton>
          ) : undefined
        }
      />
      {erro && (
        <div
          role="alert"
          className="rounded-md border border-destructive p-3 text-sm text-destructive"
        >
          {erro}
        </div>
      )}
      {aviso && (
        <p role="status" className="text-sm text-primary">
          {aviso}
        </p>
      )}
      {projetoId ? (
        <Ficha
          key={`${org}-${projetoId}`}
          org={org}
          id={projetoId}
          executar={executar}
          busy={busy}
          voltar={() => selecionar()}
        />
      ) : (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <label className={`${label} flex-1`}>
              Buscar por título
              <input
                value={busca}
                onChange={(event) => {
                  setBusca(event.target.value);
                  setPagina(0);
                }}
                className={input}
              />
            </label>
            <label className="flex min-h-11 items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={arquivados}
                onChange={(event) => {
                  setArquivados(event.target.checked);
                  setPagina(0);
                }}
              />
              Arquivados
            </label>
          </div>
          {q.isPending ? (
            <LoadingState />
          ) : q.isError ? (
            <ErrorState error={q.error} onRetry={() => q.refetch()} />
          ) : q.data.registros.length === 0 ? (
            <EmptyState
              title="Nenhum projeto neste recorte"
              hint="Crie um projeto técnico independente de proposta comercial."
              action={
                <ActionButton onClick={() => setNovo(true)}>Criar primeiro projeto</ActionButton>
              }
            />
          ) : (
            <div className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {q.data.registros.map((p) => (
                <Section key={p.id} title={p.titulo}>
                  <div className="grid gap-3">
                    <FileText size={24} aria-hidden className="text-primary" />
                    <p className="text-sm break-words">
                      {p.clientes?.razao_social} · {p.unidades?.nome || p.local_descritivo}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {p.pessoas?.nome} · {new Date(p.updated_at).toLocaleDateString("pt-BR")}
                    </p>
                    <StatusBadge value={p.arquivado ? "Arquivado" : "Ativo"} />
                    <ActionButton variant="ghost" onClick={() => selecionar(p.id)}>
                      Abrir projeto
                    </ActionButton>
                  </div>
                </Section>
              ))}
            </div>
          )}
          {q.data && q.data.total > 25 && (
            <div className="flex flex-wrap items-center gap-3">
              <ActionButton
                variant="ghost"
                disabled={pagina === 0}
                onClick={() => setPagina((p) => p - 1)}
              >
                Anterior
              </ActionButton>
              <span className="text-sm">
                Página {pagina + 1} · {q.data.total} projetos
              </span>
              <ActionButton
                variant="ghost"
                disabled={(pagina + 1) * 25 >= q.data.total}
                onClick={() => setPagina((p) => p + 1)}
              >
                Próxima
              </ActionButton>
            </div>
          )}
        </>
      )}
      <Dialog
        open={novo}
        onOpenChange={(open) => {
          if (!busy) setNovo(open);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Novo projeto técnico</DialogTitle>
            <DialogDescription>
              Cliente e pessoa vêm dos cadastros canônicos. Campos com * são obrigatórios.
            </DialogDescription>
          </DialogHeader>
          {erro && (
            <p role="alert" className="text-sm text-destructive">
              {erro}
            </p>
          )}
          <NovoProjeto executar={executar} busy={busy} fechar={() => setNovo(false)} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Ficha({
  org,
  id,
  executar,
  busy,
  voltar,
}: {
  org: string;
  id: string;
  executar: Executar;
  busy: boolean;
  voltar: () => void;
}) {
  const q = useQuery({
    queryKey: ["pe", org, "ficha", id],
    queryFn: () => obterProjetoEngenharia({ data: { organization_id: org, projeto_id: id } }),
  });
  const [versaoId, setVersaoId] = useState<string>();
  const [cenarioId, setCenarioId] = useState<string>();
  const [dirty, setDirty] = useState(false);
  const bloqueio = useBlocker({
    shouldBlockFn: () => dirty,
    enableBeforeUnload: () => dirty,
    withResolver: true,
  });
  const [motivo, setMotivo] = useState("");
  const [nomeCenario, setNomeCenario] = useState("");
  function mudar(work: () => void) {
    if (
      !dirty ||
      window.confirm("Há alterações ainda não salvas. Descartar este rascunho local e continuar?")
    ) {
      setDirty(false);
      work();
    }
  }
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const detalhe = q.data;
  const p = detalhe.projeto;
  const atualId = versaoId ?? detalhe.versoes[0]?.id;
  const atual = detalhe.versoes.find((v) => v.id === atualId);
  return (
    <div className="min-w-0 space-y-4">
      <ActionButton variant="ghost" onClick={voltar}>
        <ArrowLeft size={16} aria-hidden className="mr-2 inline" />
        Voltar ao acervo
      </ActionButton>
      <Section title={p.titulo}>
        <details>
          <summary className="cursor-pointer text-sm">
            <span className="mr-2">
              <StatusBadge value={p.arquivado ? "Arquivado" : "Ativo"} />
            </span>
            Contexto e responsabilidade ·{" "}
            {p.vigente_id
              ? `V${detalhe.versoes.find((v) => v.id === p.vigente_id)?.numero ?? "—"} vigente`
              : "Sem versão vigente"}
          </summary>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div>
              <p className="text-sm">
                {p.clientes?.razao_social} · {p.unidades?.nome || p.local_descritivo}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">Responsável: {p.pessoas?.nome}</p>
              <p className="mt-2 text-sm whitespace-pre-wrap break-words">{p.descricao}</p>
            </div>
            <div className="grid content-start gap-2">
              <p className="text-xs text-muted-foreground">
                Vigente:{" "}
                {detalhe.versoes.find((v) => v.id === p.vigente_id)?.numero
                  ? `V${detalhe.versoes.find((v) => v.id === p.vigente_id)?.numero}`
                  : "Nenhuma selecionada"}{" "}
                · {p.visibilidade === "restrito" ? "Acesso restrito" : "Engenharia da organização"}
              </p>
            </div>
          </div>
        </details>
      </Section>
      <label className={`${label} lg:hidden`}>
        Versão ou experimento
        <select
          className={input}
          value={cenarioId ? `c:${cenarioId}` : `v:${atualId}`}
          onChange={(event) =>
            mudar(() => {
              const [tipo, itemId] = event.target.value.split(":");
              if (tipo === "c") setCenarioId(itemId);
              else {
                setVersaoId(itemId);
                setCenarioId(undefined);
              }
            })
          }
        >
          {detalhe.versoes.map((v) => (
            <option key={v.id} value={`v:${v.id}`}>
              V{v.numero} · {v.estado.replaceAll("_", " ")}
            </option>
          ))}
          {detalhe.cenarios.map((c) => (
            <option key={c.id} value={`c:${c.id}`}>
              Experimento: {c.titulo}
            </option>
          ))}
        </select>
      </label>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <div className="hidden min-w-0 space-y-4 lg:block">
          <Section title="Versões">
            <div className="grid gap-2">
              {detalhe.versoes.map((v) => (
                <button
                  key={v.id}
                  type="button"
                  className={`min-h-11 rounded-md border p-3 text-left text-sm ${!cenarioId && atualId === v.id ? "border-primary bg-primary/10" : "border-border"}`}
                  aria-pressed={!cenarioId && atualId === v.id}
                  onClick={() =>
                    mudar(() => {
                      setVersaoId(v.id);
                      setCenarioId(undefined);
                    })
                  }
                >
                  <span className="font-medium">
                    V{v.numero} · {v.estado.replaceAll("_", " ")}
                  </span>
                  <span className="mt-1 block break-words text-xs text-muted-foreground">
                    {v.resumo}
                  </span>
                </button>
              ))}
            </div>
          </Section>
          {detalhe.cenarios.length > 0 && (
            <Section title="Experimentos">
              <div className="grid gap-2">
                {detalhe.cenarios.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`min-h-11 rounded-md border p-3 text-left text-sm ${cenarioId === c.id ? "border-primary bg-primary/10" : "border-border"}`}
                    aria-pressed={cenarioId === c.id}
                    onClick={() => mudar(() => setCenarioId(c.id))}
                  >
                    <GitBranch size={14} aria-hidden className="mr-1 inline" />
                    {c.titulo}
                    <span className="block text-xs text-muted-foreground">
                      {c.descartado
                        ? "Descartado com histórico"
                        : c.promovida_id
                          ? "Promovido para nova versão"
                          : "Baseline preservada"}
                    </span>
                  </button>
                ))}
              </div>
            </Section>
          )}
        </div>
        <div className="min-w-0 space-y-4">
          {atualId && (
            <Conteudo
              key={cenarioId ?? atualId}
              org={org}
              detalhe={detalhe}
              versaoId={cenarioId ? undefined : atualId}
              cenarioId={cenarioId}
              executar={executar}
              busy={busy}
              onDirty={setDirty}
              onPromovida={(vid) => {
                setCenarioId(undefined);
                setVersaoId(vid);
                setDirty(false);
              }}
            />
          )}
          {!p.arquivado && !cenarioId && atual?.estado === "congelada" && (
            <Section title="Evoluir preservando a origem">
              <div className="grid gap-3">
                <label className={label}>
                  Descrição da nova evolução
                  <input
                    className={input}
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    maxLength={2000}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    loading={busy}
                    disabled={motivo.trim().length < 3}
                    onClick={async () => {
                      const r = await executar({
                        comando: "nova_versao",
                        projeto_id: p.id,
                        versao_id: atual.id,
                        resumo: motivo,
                      });
                      if (r?.versao) {
                        setVersaoId(r.versao.id);
                        setMotivo("");
                      }
                    }}
                  >
                    Criar próxima versão
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    disabled={busy || p.vigente_id === atual.id}
                    onClick={() =>
                      executar({
                        comando: "vigente",
                        projeto_id: p.id,
                        versao_id: atual.id,
                        expected_version: p.version,
                      })
                    }
                  >
                    Definir como vigente
                  </ActionButton>
                </div>
                <label className={label}>
                  Nome do experimento
                  <input
                    className={input}
                    value={nomeCenario}
                    onChange={(e) => setNomeCenario(e.target.value)}
                    maxLength={200}
                  />
                </label>
                <ActionButton
                  variant="ghost"
                  disabled={busy || nomeCenario.trim().length < 3}
                  onClick={async () => {
                    const r = await executar({
                      comando: "criar_cenario",
                      projeto_id: p.id,
                      versao_id: atual.id,
                      titulo: nomeCenario,
                    });
                    if (r?.cenario) {
                      setCenarioId(r.cenario.id);
                      setNomeCenario("");
                    }
                  }}
                >
                  Experimentar sem alterar V{atual.numero}
                </ActionButton>
              </div>
            </Section>
          )}
        </div>
      </div>
      <Section title="Histórico">
        <ol className="space-y-3 text-sm">
          {detalhe.eventos.map((e) => (
            <li key={e.id} className="border-l-2 border-border pl-3">
              <span className="font-medium">{e.comando.replaceAll("_", " ")}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                {new Date(e.created_at).toLocaleString("pt-BR")}
              </span>
              {e.motivo && <p className="break-words text-muted-foreground">{e.motivo}</p>}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted-foreground">
          Até 100 eventos/versões recentes neste recorte. Conteúdo completo carregado apenas ao
          selecionar.
        </p>
      </Section>
      <details className="rounded-md border border-border p-4">
        <summary className="text-sm font-medium">
          {p.arquivado ? "Reativar projeto" : "Arquivar projeto"}
        </summary>
        <label className={`${label} mt-3`}>
          Motivo
          <input
            className={input}
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            minLength={5}
            maxLength={2000}
          />
        </label>
        <ActionButton
          variant="ghost"
          className="mt-3"
          disabled={busy || motivo.trim().length < 5 || dirty}
          onClick={() =>
            executar({
              comando: p.arquivado ? "reativar" : "arquivar",
              projeto_id: p.id,
              expected_version: p.version,
              motivo,
            })
          }
        >
          {p.arquivado ? "Reativar" : "Arquivar mantendo histórico"}
        </ActionButton>
      </details>
      <Dialog
        open={bloqueio.status === "blocked"}
        onOpenChange={(open) => {
          if (!open && bloqueio.status === "blocked") bloqueio.reset();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Há alterações não salvas</DialogTitle>
            <DialogDescription>
              Seu conteúdo local ainda não foi confirmado no servidor. Você pode continuar editando
              ou descartar este preenchimento para sair.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              onClick={() => {
                if (bloqueio.status === "blocked") bloqueio.reset();
              }}
            >
              Continuar editando
            </ActionButton>
            <ActionButton
              variant="ghost"
              onClick={() => {
                if (bloqueio.status === "blocked") bloqueio.proceed();
              }}
            >
              Descartar e sair
            </ActionButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Conteudo({
  org,
  detalhe,
  versaoId,
  cenarioId,
  executar,
  busy,
  onDirty,
  onPromovida,
}: {
  org: string;
  detalhe: PeDetalhe;
  versaoId?: string | undefined;
  cenarioId?: string | undefined;
  executar: Executar;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onPromovida: (id: string) => void;
}) {
  const q = useQuery({
    queryKey: ["pe", org, "conteudo", detalhe.projeto.id, versaoId, cenarioId],
    queryFn: () =>
      obterConteudoPe({
        data: {
          organization_id: org,
          projeto_id: detalhe.projeto.id,
          versao_id: versaoId,
          cenario_id: cenarioId,
        },
      }),
  });
  if (q.isPending) return <LoadingState />;
  if (q.isError) return <ErrorState error={q.error} onRetry={() => q.refetch()} />;
  const registro = q.data.versao ?? q.data.cenario;
  if (!registro) return null;
  return (
    <Editor
      key={registro.id}
      registro={registro}
      base={q.data.base}
      detalhe={detalhe}
      executar={executar}
      busy={busy}
      onDirty={onDirty}
      onPromovida={onPromovida}
      reconsultar={() => q.refetch()}
    />
  );
}

function Editor({
  registro: recebido,
  base,
  detalhe,
  executar,
  busy,
  onDirty,
  onPromovida,
  reconsultar,
}: {
  registro: PeVersao | PeCenario;
  base: PeVersao | null;
  detalhe: PeDetalhe;
  executar: Executar;
  busy: boolean;
  onDirty: (dirty: boolean) => void;
  onPromovida: (id: string) => void;
  reconsultar: () => unknown;
}) {
  const org = useOrgId();
  const [registro, setRegistro] = useState(recebido);
  const versao = "numero" in registro ? registro : null;
  const cenario = "base_id" in registro ? registro : null;
  const editavel =
    !detalhe.projeto.arquivado &&
    (versao?.estado === "rascunho" || (!!cenario && !cenario.promovida_id && !cenario.descartado));
  const [modelo, setModelo] = useState(registro.modelo);
  const [antes, setAntes] = useState<DocumentoNativo[]>([]);
  const [depois, setDepois] = useState<DocumentoNativo[]>([]);
  const [resumo, setResumo] = useState(versao?.resumo ?? "");
  const [data, setData] = useState(versao?.elaborado_em ?? "");
  const [autor, setAutor] = useState(versao?.autor_declarado ?? "");
  const [revisao, setRevisao] = useState(versao?.revisao_declarada ?? "");
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const dirty =
    JSON.stringify(modelo) !== JSON.stringify(registro.modelo) ||
    (versao &&
      (resumo !== versao.resumo ||
        data !== (versao.elaborado_em ?? "") ||
        autor !== versao.autor_declarado ||
        revisao !== versao.revisao_declarada));
  useEffect(() => {
    if (recebido.version !== registro.version && !dirty) {
      setRegistro(recebido);
      setModelo(recebido.modelo);
      if ("numero" in recebido) {
        setResumo(recebido.resumo);
        setData(recebido.elaborado_em ?? "");
        setAutor(recebido.autor_declarado);
        setRevisao(recebido.revisao_declarada);
      }
      setAntes([]);
      setDepois([]);
    }
  }, [recebido, registro.version, dirty]);
  useEffect(() => {
    onDirty(!!dirty);
  }, [dirty, onDirty]);
  useEffect(() => {
    const sair = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener("beforeunload", sair);
    return () => window.removeEventListener("beforeunload", sair);
  }, [dirty]);
  function alterar(next: DocumentoNativo) {
    setAntes((a) => [...a.slice(-19), modelo]);
    setModelo(next);
    setDepois([]);
  }
  async function salvar(event: FormEvent) {
    event.preventDefault();
    setErro(null);
    const validacao = documentoNativoSchema.safeParse(modelo);
    if (!validacao.success) {
      setErro(validacao.error.issues.map((i) => i.message).join(" "));
      return;
    }
    const r = await executar({
      comando: cenario ? "salvar_cenario" : "salvar",
      projeto_id: detalhe.projeto.id,
      versao_id: versao?.id,
      cenario_id: cenario?.id,
      expected_version: registro.version,
      modelo: validacao.data,
      resumo,
      elaborado_em: data || null,
      autor_declarado: autor,
      revisao_declarada: revisao,
    });
    if (r) {
      const salvo = r.versao ?? r.cenario;
      if (salvo) setRegistro(salvo);
      onDirty(false);
    } else {
      setErro(
        "O servidor não confirmou o salvamento. Seu preenchimento foi preservado. Tente novamente ou consulte a versão do servidor para comparar.",
      );
    }
  }
  const mudancas = base ? compararModelos(base.modelo, modelo) : [];
  async function exportar() {
    setErro(null);
    try {
      const autorizado = await obterConteudoPe({
        data: {
          organization_id: org,
          projeto_id: detalhe.projeto.id,
          versao_id: versao?.id,
          cenario_id: cenario?.id,
        },
      });
      const atual = autorizado.versao ?? autorizado.cenario;
      if (atual?.version !== registro.version)
        throw new Error(
          "O servidor tem uma versão mais recente. Consulte e compare antes de exportar.",
        );
      const manifesto = {
        formato: "nexus-pe-documental",
        schema_version: 1,
        projeto_id: detalhe.projeto.id,
        versao_id: versao?.id ?? null,
        cenario_id: cenario?.id ?? null,
        finalidade: modelo.finalidade,
        salvo_no_servidor: !dirty,
        snapshot_sha256: dirty ? null : (versao?.snapshot_sha256 ?? null),
        modelo,
        snapshot: dirty ? null : (versao?.snapshot ?? null),
      };
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(manifesto, null, 2)], { type: "application/json" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `nexus-pe-${registro.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setErro(error instanceof Error ? error.message : "Não foi possível autorizar a exportação.");
    }
  }
  return (
    <Section
      title={
        versao
          ? `V${versao.numero} · ${versao.estado.replaceAll("_", " ")}`
          : `Experimento: ${cenario?.titulo}`
      }
    >
      <p className="mb-4 text-xs text-muted-foreground">
        Documento nativo · {base ? `Origem: V${base.numero}` : "Primeira versão"}
        {cenario ? " · Experimento separado da baseline" : ""}
      </p>
      <form onSubmit={salvar} className="grid min-w-0 gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="mr-auto text-xs text-muted-foreground">
            {dirty ? "Alterações locais ainda não salvas" : "Conteúdo salvo"}
          </p>
          <ActionButton
            variant="ghost"
            disabled={!editavel || !antes.length || busy}
            onClick={() => {
              const anterior = antes.at(-1);
              if (anterior) {
                setDepois((d) => [modelo, ...d]);
                setModelo(anterior);
                setAntes((a) => a.slice(0, -1));
              }
            }}
          >
            <RotateCcw size={14} className="mr-1 inline" aria-hidden />
            Desfazer
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={!editavel || !depois.length || busy}
            onClick={() => {
              const proximo = depois[0];
              if (proximo) {
                setAntes((a) => [...a, modelo]);
                setModelo(proximo);
                setDepois((d) => d.slice(1));
              }
            }}
          >
            <RotateCw size={14} className="mr-1 inline" aria-hidden />
            Refazer
          </ActionButton>
        </div>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        {(dirty || erro || recebido.version !== registro.version) && (
          <ActionButton variant="ghost" disabled={busy} onClick={reconsultar}>
            Consultar versão do servidor
          </ActionButton>
        )}
        {recebido.version !== registro.version && (
          <div role="alert" className="grid gap-3 rounded-md border border-warning p-3 text-sm">
            <p>
              Outra pessoa salvou uma edição. Seu conteúdo local foi preservado e continua associado
              à versão {registro.version}.
            </p>
            <details>
              <summary>Comparar conteúdo local com o servidor</summary>
              <ol className="mt-2 space-y-2">
                {compararModelos(modelo, recebido.modelo).map((m, i) => (
                  <li key={`${m.id}-${i}`}>
                    <strong>{m.campo}</strong>
                    <p className="break-words">Local: {m.anterior || "—"}</p>
                    <p className="break-words">Servidor: {m.atual || "—"}</p>
                  </li>
                ))}
              </ol>
            </details>
            <ActionButton
              variant="ghost"
              onClick={() => {
                if (
                  dirty &&
                  !window.confirm("Substituir este conteúdo local pela edição do servidor?")
                )
                  return;
                setRegistro(recebido);
                setModelo(recebido.modelo);
                setAntes([]);
                setDepois([]);
                if ("numero" in recebido) {
                  setResumo(recebido.resumo);
                  setData(recebido.elaborado_em ?? "");
                  setAutor(recebido.autor_declarado);
                  setRevisao(recebido.revisao_declarada);
                }
              }}
            >
              Recarregar conteúdo do servidor
            </ActionButton>
          </div>
        )}
        {editavel ? (
          <fieldset disabled={busy} className="grid min-w-0 gap-4">
            {versao && (
              <>
                <label className={label}>
                  Descrição das mudanças *
                  <textarea
                    className={input}
                    value={resumo}
                    onChange={(e) => setResumo(e.target.value)}
                    rows={2}
                    required
                    minLength={3}
                    maxLength={2000}
                  />
                </label>
                <details>
                  <summary className="cursor-pointer text-sm text-muted-foreground">
                    Data, autor e revisão declarada
                  </summary>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    <label className={label}>
                      Elaborado em
                      <input
                        className={input}
                        type="date"
                        value={data}
                        onChange={(e) => setData(e.target.value)}
                      />
                    </label>
                    <label className={label}>
                      Revisão declarada
                      <input
                        className={input}
                        value={revisao}
                        onChange={(e) => setRevisao(e.target.value)}
                        maxLength={40}
                      />
                    </label>
                    <label className={label}>
                      Autor declarado
                      <input
                        className={input}
                        value={autor}
                        onChange={(e) => setAutor(e.target.value)}
                        maxLength={200}
                      />
                    </label>
                  </div>
                </details>
              </>
            )}
            <label className={label}>
              Finalidade
              <select
                className={input}
                value={modelo.finalidade}
                onChange={(e) =>
                  alterar({
                    ...modelo,
                    finalidade: e.target.value as DocumentoNativo["finalidade"],
                  })
                }
              >
                <option value="estudo">Estudo</option>
                <option value="layout_preliminar">Layout preliminar</option>
                <option value="referencia_documental">Referência documental</option>
              </select>
            </label>
            {modelo.secoes.map((s, indice) => (
              <div key={s.id} className="grid min-w-0 gap-2 rounded-md border border-border p-3">
                <label className={label}>
                  Seção {indice + 1}
                  <input
                    className={input}
                    value={s.titulo}
                    maxLength={160}
                    required
                    onChange={(e) =>
                      alterar({
                        ...modelo,
                        secoes: modelo.secoes.map((item) =>
                          item.id === s.id ? { ...item, titulo: e.target.value } : item,
                        ),
                      })
                    }
                  />
                </label>
                <label className={label}>
                  Conteúdo
                  <textarea
                    className={`${input} min-h-32`}
                    rows={5}
                    maxLength={20000}
                    value={s.texto}
                    onChange={(e) =>
                      alterar({
                        ...modelo,
                        secoes: modelo.secoes.map((item) =>
                          item.id === s.id ? { ...item, texto: e.target.value } : item,
                        ),
                      })
                    }
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <ActionButton
                    variant="ghost"
                    disabled={indice === 0}
                    onClick={() => {
                      const secoes = [...modelo.secoes];
                      const anterior = secoes[indice - 1];
                      const atual = secoes[indice];
                      if (!anterior || !atual) return;
                      secoes[indice - 1] = atual;
                      secoes[indice] = anterior;
                      alterar({ ...modelo, secoes });
                    }}
                  >
                    Mover acima
                  </ActionButton>
                  <ActionButton
                    variant="ghost"
                    disabled={modelo.secoes.length <= 1}
                    onClick={() =>
                      alterar({
                        ...modelo,
                        secoes: modelo.secoes.filter((item) => item.id !== s.id),
                      })
                    }
                  >
                    Remover seção
                  </ActionButton>
                </div>
              </div>
            ))}
            {editavel && (
              <ActionButton
                variant="ghost"
                disabled={modelo.secoes.length >= 50}
                onClick={() =>
                  alterar({
                    ...modelo,
                    secoes: [
                      ...modelo.secoes,
                      { id: crypto.randomUUID(), titulo: "Nova seção", texto: "" },
                    ],
                  })
                }
              >
                Adicionar seção
              </ActionButton>
            )}
            <div className="grid gap-3">
              <h3 className="text-sm font-medium">Parâmetros e proveniência</h3>
              <p className="text-xs text-muted-foreground">
                Valores conservam o texto original e a unidade. Conferido significa conferência
                registrada; não é uma declaração automática de conformidade.
              </p>
              {modelo.parametros.map((parametro) => (
                <div
                  key={parametro.id}
                  className="grid min-w-0 gap-3 rounded-md border border-border p-3 sm:grid-cols-2"
                >
                  {(["nome", "valor_original", "unidade", "fonte"] as const).map((campo) => (
                    <label key={campo} className={label}>
                      {
                        {
                          nome: "Nome e papel",
                          valor_original: "Valor original",
                          unidade: "Unidade",
                          fonte: "Fonte e referência",
                        }[campo]
                      }{" "}
                      *
                      <input
                        className={input}
                        required
                        maxLength={campo === "fonte" ? 1000 : campo === "unidade" ? 30 : 120}
                        value={parametro[campo]}
                        onChange={(e) =>
                          alterar({
                            ...modelo,
                            parametros: modelo.parametros.map((p) =>
                              p.id === parametro.id ? { ...p, [campo]: e.target.value } : p,
                            ),
                          })
                        }
                      />
                    </label>
                  ))}
                  <label className={label}>
                    Natureza
                    <select
                      className={input}
                      value={parametro.natureza}
                      onChange={(e) =>
                        alterar({
                          ...modelo,
                          parametros: modelo.parametros.map((p) =>
                            p.id === parametro.id
                              ? { ...p, natureza: e.target.value as typeof p.natureza }
                              : p,
                          ),
                        })
                      }
                    >
                      {["declarado", "medido", "estimado", "proposto"].map((v) => (
                        <option key={v}>{v}</option>
                      ))}
                    </select>
                  </label>
                  <label className={label}>
                    Conferência
                    <select
                      className={input}
                      value={parametro.validacao}
                      onChange={(e) =>
                        alterar({
                          ...modelo,
                          parametros: modelo.parametros.map((p) =>
                            p.id === parametro.id
                              ? { ...p, validacao: e.target.value as typeof p.validacao }
                              : p,
                          ),
                        })
                      }
                    >
                      {["a_confirmar", "conferido", "divergente"].map((v) => (
                        <option key={v} value={v}>
                          {v.replaceAll("_", " ")}
                        </option>
                      ))}
                    </select>
                  </label>
                  <ActionButton
                    variant="ghost"
                    onClick={() =>
                      alterar({
                        ...modelo,
                        parametros: modelo.parametros.filter((p) => p.id !== parametro.id),
                      })
                    }
                  >
                    Remover parâmetro
                  </ActionButton>
                </div>
              ))}
              {editavel && (
                <ActionButton
                  variant="ghost"
                  disabled={modelo.parametros.length >= 200}
                  onClick={() =>
                    alterar({
                      ...modelo,
                      parametros: [
                        ...modelo.parametros,
                        {
                          id: crypto.randomUUID(),
                          nome: "",
                          valor_original: "",
                          unidade: "",
                          fonte: "",
                          natureza: "declarado",
                          validacao: "a_confirmar",
                        },
                      ],
                    })
                  }
                >
                  Adicionar parâmetro com fonte
                </ActionButton>
              )}
            </div>
            {editavel && (
              <div className="space-y-2">
                {erro && (
                  <p role="alert" className="text-sm text-destructive">
                    {erro}
                  </p>
                )}
                <ActionButton type="submit" loading={busy} disabled={!dirty}>
                  Salvar rascunho
                </ActionButton>
              </div>
            )}
          </fieldset>
        ) : (
          <article className="grid min-w-0 gap-5">
            {versao && (
              <div className="grid gap-2 text-sm">
                <p>{versao.resumo}</p>
                <p className="text-xs text-muted-foreground">
                  Elaboração original: {versao.elaborado_em || "Não informada"} · Autor declarado:{" "}
                  {versao.autor_declarado || "Não informado"} · Revisão declarada:{" "}
                  {versao.revisao_declarada || "Não informada"}
                </p>
                {versao.snapshot && (
                  <p className="text-xs text-muted-foreground">
                    Contexto preservado no congelamento: {versao.snapshot.projeto.cliente} ·{" "}
                    {versao.snapshot.projeto.unidade || versao.snapshot.projeto.local}
                  </p>
                )}
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Finalidade: {modelo.finalidade.replaceAll("_", " ")}
            </p>
            {modelo.secoes.map((s) => (
              <section key={s.id} className="min-w-0">
                <h3 className="text-sm font-semibold">{s.titulo}</h3>
                <p className="mt-2 break-words whitespace-pre-wrap text-sm">
                  {s.texto || "Sem conteúdo nesta seção."}
                </p>
              </section>
            ))}
            {modelo.parametros.length > 0 && (
              <section className="grid min-w-0 gap-3">
                <h3 className="text-sm font-semibold">Parâmetros e proveniência</h3>
                {modelo.parametros.map((p) => (
                  <div key={p.id} className="rounded-md border border-border p-3">
                    <p className="break-words text-sm font-medium">
                      {p.nome}:{" "}
                      <span className="tabular-nums">
                        {p.valor_original} {p.unidade}
                      </span>
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {p.natureza} · {p.validacao.replaceAll("_", " ")}
                    </p>
                    <p className="mt-2 break-words text-xs">Fonte: {p.fonte}</p>
                  </div>
                ))}
              </section>
            )}
          </article>
        )}
      </form>
      {versao && (
        <div className="mt-5">
          <ArquivosPe org={org} versaoId={versao.id} editavel={editavel} />
        </div>
      )}
      {base && (
        <details className="mt-4 rounded-md border border-border p-3">
          <summary className="text-sm font-medium">
            Comparar com V{base.numero} · {mudancas.length} alterações
          </summary>
          {mudancas.length ? (
            <ol className="mt-3 space-y-3">
              {mudancas.map((m, i) => (
                <li key={`${m.id}-${m.campo}-${i}`} className="grid gap-1 text-xs">
                  <strong>{m.campo}</strong>
                  <p className="break-words whitespace-pre-wrap">Antes: {m.anterior || "—"}</p>
                  <p className="break-words whitespace-pre-wrap">Depois: {m.atual || "—"}</p>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-xs text-muted-foreground">
              Nenhuma diferença no conteúdo nativo.
            </p>
          )}
        </details>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <ActionButton variant="ghost" onClick={exportar}>
          {dirty ? "Baixar rascunho local não salvo" : "Exportar modelo e manifesto JSON"}
        </ActionButton>
        {versao?.estado === "rascunho" && !detalhe.projeto.arquivado && (
          <ActionButton
            disabled={busy || !!dirty}
            onClick={() =>
              executar({
                comando: "submeter",
                projeto_id: detalhe.projeto.id,
                versao_id: versao.id,
                expected_version: versao.version,
              })
            }
          >
            Enviar para revisão interna
          </ActionButton>
        )}
      </div>
      {versao?.estado === "em_revisao" && !detalhe.projeto.arquivado && (
        <div className="mt-4 grid gap-3">
          <label className={label}>
            Motivo da devolução
            <input
              className={input}
              value={motivo}
              maxLength={2000}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <ActionButton
              variant="ghost"
              disabled={busy || motivo.trim().length < 5}
              onClick={() =>
                executar({
                  comando: "devolver",
                  projeto_id: detalhe.projeto.id,
                  versao_id: versao.id,
                  expected_version: versao.version,
                  motivo,
                })
              }
            >
              Devolver ao rascunho
            </ActionButton>
            <ActionButton
              disabled={busy}
              onClick={() =>
                executar({
                  comando: "congelar",
                  projeto_id: detalhe.projeto.id,
                  versao_id: versao.id,
                  expected_version: versao.version,
                })
              }
            >
              Congelar revisão interna
            </ActionButton>
          </div>
        </div>
      )}
      {cenario && !cenario.promovida_id && !cenario.descartado && !detalhe.projeto.arquivado && (
        <div className="mt-4 grid gap-3">
          <label className={label}>
            Resumo da promoção para nova versão
            <textarea
              className={input}
              value={resumo}
              onChange={(e) => setResumo(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </label>
          <ActionButton
            disabled={busy || !!dirty || resumo.trim().length < 3}
            onClick={async () => {
              const r = await executar({
                comando: "promover_cenario",
                projeto_id: detalhe.projeto.id,
                cenario_id: cenario.id,
                expected_version: cenario.version,
                resumo,
              });
              if (r?.versao) onPromovida(r.versao.id);
            }}
          >
            Promover como nova versão
          </ActionButton>
        </div>
      )}
      {cenario && !cenario.promovida_id && !cenario.descartado && !detalhe.projeto.arquivado && (
        <details className="mt-4 rounded-md border border-border p-3">
          <summary className="text-sm">Descartar experimento mantendo histórico</summary>
          <label className={`${label} mt-3`}>
            Motivo
            <input
              className={input}
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={2000}
            />
          </label>
          <ActionButton
            variant="ghost"
            className="mt-3"
            disabled={busy || !!dirty || motivo.trim().length < 5}
            onClick={() =>
              executar({
                comando: "descartar_cenario",
                projeto_id: detalhe.projeto.id,
                cenario_id: cenario.id,
                expected_version: cenario.version,
                motivo,
              })
            }
          >
            Confirmar descarte
          </ActionButton>
        </details>
      )}
      {versao?.snapshot_sha256 && (
        <p className="mt-4 break-all font-mono text-xs text-muted-foreground">
          Snapshot SHA-256: {versao.snapshot_sha256}
        </p>
      )}
    </Section>
  );
}
