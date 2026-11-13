import { useId, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, EmptyState, ErrorState, LoadingState } from "@/components/nexus/Page";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { ValorEstruturado } from "./apresentacao";
import {
  inspecoesAcervoSalvar,
  inspecoesApresentacaoSalvar,
  inspecoesHistorico,
} from "./manutencao.functions";
import type { InspecoesArquivo, InspecoesDetalhe, InspecoesEscopo } from "./ui-contract";
import { useInspecoesChave } from "./use-inspecoes-chave";

export function InspecoesEditorDialog({
  label,
  title,
  description,
  children,
}: {
  label: string;
  title: string;
  description: string;
  children: (props: { close: () => void; setBusy: (value: boolean) => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const close = () => {
    setOpen(false);
    setConfirm(false);
    setDirty(false);
  };
  const requestClose = () => {
    if (busy) return;
    if (dirty) setConfirm(true);
    else close();
  };
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : requestClose())}>
      <DialogTrigger asChild>
        <ActionButton variant="ghost">{label}</ActionButton>
      </DialogTrigger>
      <DialogContent className="nx-nr-workspace insp-editor-dialog">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="insp-stack" onChange={() => setDirty(true)}>
          {open && children({ close, setBusy })}
          {confirm && (
            <div className="insp-stack" role="alert">
              <p>Descartar as alterações ainda não salvas?</p>
              <div className="insp-actions">
                <ActionButton variant="ghost" onClick={() => setConfirm(false)}>
                  Continuar editando
                </ActionButton>
                <ActionButton variant="ghost" onClick={close}>
                  Descartar alterações
                </ActionButton>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

type EditorScope = {
  escopo: InspecoesEscopo;
  onSaved: (id: string) => void;
};
type Registro = InspecoesDetalhe["registro"];

export function InspecoesNovoDocumento({
  escopo,
  onSaved,
  vinculo,
}: EditorScope & { vinculo?: Registro | undefined }) {
  if (!escopo.clienteId || !escopo.unidadeId) return null;
  return (
    <InspecoesEditorDialog
      label={vinculo ? "Novo documento vinculado" : "Novo documento"}
      title="Cadastrar documento"
      description={
        vinculo
          ? `O documento será vinculado a ${vinculo.titulo}.`
          : "O documento será cadastrado na unidade selecionada. Anexe o arquivo na ficha após salvar."
      }
    >
      {(dialog) => <RegistroForm escopo={escopo} onSaved={onSaved} vinculo={vinculo} {...dialog} />}
    </InspecoesEditorDialog>
  );
}

export function InspecoesEditarRegistro({
  escopo,
  item,
  onSaved,
}: EditorScope & { item: Registro }) {
  return (
    <InspecoesEditorDialog
      label="Corrigir ficha"
      title="Corrigir identificação da ficha"
      description="A correção fica no histórico. O conteúdo técnico e os dados da origem são preservados."
    >
      {(dialog) => <RegistroForm escopo={escopo} onSaved={onSaved} item={item} {...dialog} />}
    </InspecoesEditorDialog>
  );
}

function RegistroForm({
  escopo,
  item,
  vinculo,
  onSaved,
  close,
  setBusy,
}: EditorScope & {
  item?: Registro;
  vinculo?: Registro | undefined;
  close: () => void;
  setBusy: (busy: boolean) => void;
}) {
  const save = useServerFn(inspecoesAcervoSalvar);
  const requestKey = useInspecoesChave();
  const busyRef = useRef(false);
  const [busy, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const fields = new FormData(event.currentTarget);
    const dados = {
      titulo: String(fields.get("titulo") ?? "").trim(),
      nota: String(fields.get("nota") ?? "").trim(),
      motivo: String(fields.get("motivo") ?? "").trim(),
      ...(!item ? { codigo: String(fields.get("codigo") ?? "").trim() } : {}),
      ...(vinculo ? { relacionado_id: vinculo.id } : {}),
    };
    busyRef.current = true;
    setError(undefined);
    setBusy(true);
    setSaving(true);
    try {
      const result = await save({
        data: {
          organizationId: escopo.organizationId,
          clienteId: item ? item.cliente_id : (escopo.clienteId ?? null),
          unidadeId: item ? item.unidade_id : (escopo.unidadeId ?? null),
          id: item?.id ?? null,
          versao: item?.acervo_versao ?? 0,
          dados,
          chave: requestKey(dados),
        },
      });
      close();
      onSaved(result.id);
    } catch (err) {
      setError(err);
    } finally {
      busyRef.current = false;
      setBusy(false);
      setSaving(false);
    }
  }
  return (
    <form className="insp-stack" onSubmit={(event) => void submit(event)}>
      <label className="insp-field">
        Título
        <input name="titulo" defaultValue={item?.titulo} minLength={2} maxLength={1000} required />
      </label>
      {!item && (
        <label className="insp-field">
          Código (opcional)
          <input name="codigo" maxLength={100} />
        </label>
      )}
      <label className="insp-field">
        Nota de cadastro
        <textarea name="nota" defaultValue={item?.nota_acervo ?? ""} rows={3} maxLength={8000} />
      </label>
      <label className="insp-field">
        Motivo
        <textarea name="motivo" rows={2} minLength={5} maxLength={2000} required />
      </label>
      {error != null && <ErrorState error={error} />}
      <div className="insp-actions">
        <ActionButton type="submit" loading={busy}>
          Salvar {item ? "correção" : "documento"}
        </ActionButton>
      </div>
    </form>
  );
}

export function InspecoesEditarFoto({
  organizationId,
  file,
  onSaved,
}: {
  organizationId: string;
  file: InspecoesArquivo;
  onSaved: () => void;
}) {
  if (
    file.papel !== "foto" ||
    !["original_verificado", "falha_processamento"].includes(file.estado)
  )
    return null;
  return (
    <InspecoesEditorDialog
      label="Editar legenda e ordem"
      title="Apresentação da fotografia"
      description="A mudança vale para a galeria e preserva os bytes e a legenda de origem."
    >
      {(dialog) => (
        <FotoForm organizationId={organizationId} file={file} onSaved={onSaved} {...dialog} />
      )}
    </InspecoesEditorDialog>
  );
}

function FotoForm({
  organizationId,
  file,
  onSaved,
  close,
  setBusy,
}: {
  organizationId: string;
  file: InspecoesArquivo;
  onSaved: () => void;
  close: () => void;
  setBusy: (value: boolean) => void;
}) {
  const save = useServerFn(inspecoesApresentacaoSalvar);
  const requestKey = useInspecoesChave();
  const busyRef = useRef(false);
  const [busy, setSaving] = useState(false);
  const [error, setError] = useState<unknown>();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busyRef.current) return;
    const fields = new FormData(event.currentTarget);
    const order = String(fields.get("ordem") ?? "").trim();
    const data = {
      organizationId,
      id: file.id,
      versao: file.apresentacaoVersao ?? 0,
      legenda: String(fields.get("legenda") ?? "").trim(),
      ordem: order ? Number(order) : null,
      motivo: String(fields.get("motivo") ?? "").trim(),
    };
    setError(undefined);
    busyRef.current = true;
    setBusy(true);
    setSaving(true);
    try {
      await save({ data: { ...data, chave: requestKey(data) } });
      close();
      onSaved();
    } catch (err) {
      setError(err);
    } finally {
      busyRef.current = false;
      setSaving(false);
      setBusy(false);
    }
  }
  return (
    <form className="insp-stack" onSubmit={(event) => void submit(event)}>
      <label className="insp-field">
        Legenda
        <textarea name="legenda" defaultValue={file.legenda ?? ""} maxLength={2000} rows={3} />
      </label>
      <label className="insp-field">
        Ordem na galeria
        <input name="ordem" type="number" min={0} max={100000} defaultValue={file.ordem ?? ""} />
      </label>
      <label className="insp-field">
        Motivo
        <textarea name="motivo" minLength={5} maxLength={2000} required rows={2} />
      </label>
      {error != null && <ErrorState error={error} />}
      <ActionButton type="submit" loading={busy}>
        Salvar apresentação
      </ActionButton>
    </form>
  );
}

const eventNames: Record<string, string> = {
  cadastro_acervo: "Documento cadastrado",
  correcao_acervo: "Ficha corrigida",
  apresentacao_foto: "Apresentação da fotografia alterada",
  unidade_incluida: "Unidade incluída em Inspeções",
  versao_ensaio: "Versão de ensaio registrada",
  emissao: "Laudo emitido",
  criar_contrato: "Contrato criado",
  editar_contrato: "Contrato editado",
  ativar_contrato: "Vigência registrada",
  cancelar_contrato: "Contrato cancelado",
  planejar_ciclo: "Ciclo planejado",
  vincular_os: "Ordem de serviço vinculada",
  criado: "Cadastro criado",
  alterado: "Cadastro alterado",
  arquivado: "Cadastro arquivado",
  reativado: "Cadastro reativado",
  criar: "Levantamento criado",
  salvar: "Levantamento salvo",
  submeter: "Levantamento enviado para revisão",
  devolver: "Levantamento devolvido",
  aprovar: "Levantamento aprovado",
  emitir: "Laudo emitido",
  reservado: "Envio de arquivo iniciado",
  verificado: "Arquivo verificado",
  cancelado: "Envio cancelado",
  miniaturas_verificadas: "Prévia e miniatura verificadas",
};

export function InspecoesHistorico({
  organizationId,
  tipo,
  id,
  clienteId,
  queryKey,
}: {
  organizationId: string;
  tipo: "registro" | "emissao" | "contrato" | "unidade";
  id: string;
  clienteId?: string | undefined;
  queryKey: readonly string[];
}) {
  const heading = useId();
  const [page, setPage] = useState(0);
  const load = useServerFn(inspecoesHistorico);
  const history = useQuery({
    queryKey: [...queryKey, "historico", tipo, id, clienteId ?? "", page],
    queryFn: ({ signal }) =>
      load({ data: { organizationId, tipo, id, clienteId, pagina: page }, signal }),
    retry: false,
  });
  return (
    <section className="insp-stack" aria-labelledby={heading}>
      <h3 id={heading} className="insp-subheading">
        Histórico na Nexus
      </h3>
      {history.isPending && <LoadingState label="Carregando histórico…" />}
      {history.isError && (
        <ErrorState error={history.error} onRetry={() => void history.refetch()} />
      )}
      {history.data?.eventos.length === 0 && (
        <EmptyState title="Nenhuma alteração registrada na Nexus" />
      )}
      {history.data?.eventos.length ? (
        <ol className="insp-history-list">
          {history.data.eventos.map((entry) => (
            <li key={entry.id} className="insp-history-event">
              <h4>{eventNames[entry.evento] ?? "Evento registrado"}</h4>
              <p>
                {entry.autor ?? "Autoria não informada"} · {formatTime(entry.ocorridoEm)}
                {entry.versao != null && ` · Versão ${entry.versao}`}
              </p>
              {entry.motivo && <p>{entry.motivo}</p>}
              {(entry.antes || entry.depois) && (
                <details>
                  <summary>Conferir alteração</summary>
                  {entry.antes && (
                    <>
                      <h5>Antes</h5>
                      <ValorEstruturado value={entry.antes} />
                    </>
                  )}
                  {entry.depois && (
                    <>
                      <h5>Depois</h5>
                      <ValorEstruturado value={entry.depois} />
                    </>
                  )}
                </details>
              )}
            </li>
          ))}
        </ol>
      ) : null}
      {(page > 0 || history.data?.mais) && (
        <div className="insp-actions">
          <ActionButton
            variant="ghost"
            disabled={page === 0 || history.isPending}
            onClick={() => setPage((v) => v - 1)}
          >
            Eventos mais recentes
          </ActionButton>
          <ActionButton
            variant="ghost"
            disabled={!history.data?.mais}
            onClick={() => setPage((v) => v + 1)}
          >
            Eventos anteriores
          </ActionButton>
        </div>
      )}
    </section>
  );
}

function formatTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Data não informada"
    : new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: "America/Sao_Paulo",
      }).format(date);
}
