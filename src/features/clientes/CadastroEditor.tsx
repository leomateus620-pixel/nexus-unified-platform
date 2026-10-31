import * as Dialog from "@radix-ui/react-dialog";
import * as AlertDialog from "@radix-ui/react-alert-dialog";
import { useBlocker } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { ActionButton, ErrorState } from "@/components/nexus/Page";
import {
  arquivarCadastro,
  obterCadastro,
  salvarCliente,
  salvarContato,
  salvarUnidade,
} from "./clientes.functions";
import {
  arquivarInput,
  cadastroArquivado,
  clienteDados,
  contatoDados,
  unidadeDados,
  type Cadastro,
  type CadastroGrupo,
  type Contato,
} from "./schemas";
import { useCadastroList, useDebouncedSearch } from "./queries";
import { CLIENTE_MARCA_MAX_BYTES, marcaImagem } from "./marca";
import type { z } from "zod";
import type { clienteMarcaUploadSchema } from "./schemas";

type Values = Record<string, string>;
const labels: Record<string, string> = {
  razao_social: "Razão social",
  nome_exibicao: "Nome de exibição",
  cnpj: "Identificador fiscal",
  cidade: "Cidade",
  uf: "UF",
  observacoes: "Observações",
  nome: "Nome",
  endereco: "Endereço",
  distancia_ida_volta_km: "Distância de referência de ida e volta (km)",
  cargo: "Cargo",
  email: "E-mail",
  telefone: "Telefone",
  unidade_id: "Unidade de atuação",
  motivo: "Motivo",
  marca: "Marca do cliente",
};
const fieldSets = {
  clientes: ["razao_social", "nome_exibicao", "cnpj", "cidade", "uf", "observacoes"],
  unidades: ["nome", "endereco", "distancia_ida_volta_km", "observacoes"],
  contatos: ["nome", "cargo", "email", "telefone", "unidade_id", "observacoes"],
} as const;
function initialValues(grupo: CadastroGrupo, row: Cadastro | null): Values {
  return Object.fromEntries(
    fieldSets[grupo].map((key) => [
      key,
      row && key in row ? String((row as unknown as Record<string, unknown>)[key] ?? "") : "",
    ]),
  );
}
function useRequestKey() {
  const ref = useRef({ payload: "", key: "" });
  return (data: unknown) => {
    const payload = JSON.stringify(data);
    if (ref.current.payload !== payload || !ref.current.key)
      ref.current = { payload, key: crypto.randomUUID() };
    return ref.current.key;
  };
}

export function CadastroEditor({
  org,
  grupo,
  cliente,
  row,
  onClose,
  onSaved,
  archive = false,
}: {
  org: string;
  grupo: CadastroGrupo;
  cliente: string | null;
  row: Cadastro | null;
  onClose: () => void;
  onSaved: (row: Cadastro) => void;
  archive?: boolean;
}) {
  const id = useId().replace(/:/g, "");
  const [base, setBase] = useState(row);
  const [values, setValues] = useState<Values>(() =>
    archive ? { motivo: "" } : initialValues(grupo, row),
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [marcaUpload, setMarcaUpload] = useState<
    z.infer<typeof clienteMarcaUploadSchema> | undefined
  >();
  const [removerMarca, setRemoverMarca] = useState(false);
  const [marcaLendo, setMarcaLendo] = useState(false);
  const marcaAtual = base && "marca" in base ? base.marca : null;
  const marcaPreview = marcaUpload
    ? `data:${marcaUpload.mime};base64,${marcaUpload.base64}`
    : removerMarca
      ? undefined
      : marcaImagem(marcaAtual);
  const [discard, setDiscard] = useState(false);
  const [comparison, setComparison] = useState<Cadastro | null>(null);
  const [compareError, setCompareError] = useState<unknown>(null);
  const [comparing, setComparing] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);
  const marcaInput = useRef<HTMLInputElement>(null);
  const allowClose = useRef(false);
  const feedback = useRef<HTMLDivElement>(null);
  const qc = useQueryClient();
  const requestKey = useRequestKey();
  const saveCliente = useServerFn(salvarCliente);
  const saveUnidade = useServerFn(salvarUnidade);
  const saveContato = useServerFn(salvarContato);
  const archiveCadastro = useServerFn(arquivarCadastro);
  const getCurrent = useServerFn(obterCadastro);
  const dirty =
    !!marcaUpload ||
    removerMarca ||
    marcaLendo ||
    JSON.stringify(values) !==
      JSON.stringify(archive ? { motivo: "" } : initialValues(grupo, base));
  const mutation = useMutation({
    mutationFn: async (data: Values) => {
      const common = {
        organization_id: org,
        id: base?.id ?? null,
        expected_version: base?.version ?? null,
      };
      if (archive && base) {
        const body = arquivarInput.parse({
          ...common,
          entidade: grupo,
          arquivar: !cadastroArquivado(grupo, base),
          motivo: data["motivo"],
          chave: crypto.randomUUID(),
        });
        return archiveCadastro({
          data: { ...body, chave: requestKey({ ...body, chave: undefined }) },
        });
      }
      if (grupo === "clientes") {
        const body = {
          ...common,
          dados: clienteDados.parse(data),
          ...(marcaUpload ? { marca_upload: marcaUpload } : {}),
          ...(removerMarca ? { remover_marca: true } : {}),
        };
        return saveCliente({ data: { ...body, chave: requestKey(body) } });
      }
      if (grupo === "unidades") {
        const body = {
          ...common,
          cliente_id: cliente!,
          dados: unidadeDados.parse({
            ...data,
            distancia_ida_volta_km: data["distancia_ida_volta_km"]?.trim()
              ? Number(data["distancia_ida_volta_km"].replace(",", "."))
              : null,
          }),
        };
        return saveUnidade({ data: { ...body, chave: requestKey(body) } });
      }
      const body = {
        ...common,
        cliente_id: cliente!,
        dados: contatoDados.parse({ ...data, unidade_id: data["unidade_id"] || null }),
      };
      return saveContato({ data: { ...body, chave: requestKey(body) } });
    },
    onSuccess: async (saved) => {
      allowClose.current = true;
      await qc.invalidateQueries({ queryKey: ["clientes", org] });
      onSaved(saved);
    },
    onError: (error) => {
      if (grupo === "clientes" && /identificador fiscal já cadastrado/i.test(error.message))
        setErrors((current) => ({
          ...current,
          cnpj: "Identificador já cadastrado. Localize e confira o registro existente.",
        }));
      requestAnimationFrame(() => feedback.current?.focus());
    },
  });
  const blocker = useBlocker({
    withResolver: true,
    shouldBlockFn: () => !allowClose.current && (dirty || mutation.isPending),
    enableBeforeUnload: () => !allowClose.current && (dirty || mutation.isPending),
  });
  const close = () => {
    if (mutation.isPending || marcaLendo) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const abandon = () => {
    allowClose.current = true;
    if (blocker.status === "blocked") blocker.proceed?.();
    else onClose();
  };
  const keep = () => {
    setDiscard(false);
    if (!allowClose.current) blocker.reset?.();
  };
  const fieldId = (name: string) => `${id}-${name}`;
  const set = (name: string, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[name];
      return next;
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (marcaLendo || mutation.isPending || errors["marca"]) return;
    const source = archive
      ? { motivo: values["motivo"] }
      : grupo === "unidades"
        ? {
            ...values,
            distancia_ida_volta_km: values["distancia_ida_volta_km"]?.trim()
              ? Number(values["distancia_ida_volta_km"].replace(",", "."))
              : null,
          }
        : grupo === "contatos"
          ? { ...values, unidade_id: values["unidade_id"] || null }
          : values;
    const schema = archive
      ? arquivarInput.pick({ motivo: true })
      : grupo === "clientes"
        ? clienteDados
        : grupo === "unidades"
          ? unidadeDados
          : contatoDados;
    const checked = schema.safeParse(source);
    if (!checked.success) {
      const next = Object.fromEntries(
        checked.error.issues.map((issue) => [String(issue.path[0]), issue.message]),
      );
      setErrors(next);
      const first = checked.error.issues[0]?.path[0];
      requestAnimationFrame(() => {
        if (first) document.getElementById(fieldId(String(first)))?.focus();
      });
      return;
    }
    setErrors({});
    mutation.mutate(values);
  };
  const compare = async () => {
    if (!base) return;
    setComparing(true);
    setCompareError(null);
    try {
      setComparison(
        await getCurrent({ data: { organization_id: org, entidade: grupo, id: base.id } }),
      );
    } catch (error) {
      setCompareError(error);
    } finally {
      setComparing(false);
    }
  };
  const replacing = base && cadastroArquivado(grupo, base);
  const singular = grupo === "clientes" ? "cliente" : grupo === "unidades" ? "unidade" : "contato";
  const title = archive
    ? `${replacing ? "Reativar" : "Arquivar"} ${singular}`
    : `${base ? "Editar" : "Novo cadastro de"} ${singular}`;
  return (
    <>
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open) close();
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="nx-prompt-overlay" />
          <Dialog.Content
            className="nexus-operational nx-prompt-dialog nx-cadastro-dialog"
            onEscapeKeyDown={(event) => {
              if (mutation.isPending) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (mutation.isPending) event.preventDefault();
            }}
          >
            <Dialog.Title className="pr-10 text-lg font-semibold">{title}</Dialog.Title>
            <Dialog.Description className="text-sm text-muted-foreground">
              {archive
                ? "O histórico e os vínculos existentes serão preservados. Informe o motivo da mudança."
                : "Campos com * são obrigatórios. O salvamento confirma a persistência do cadastro."}
            </Dialog.Description>
            <button
              type="button"
              onClick={close}
              disabled={mutation.isPending}
              className="nx-client-close"
              aria-label="Fechar formulário"
            >
              <X size={20} aria-hidden="true" />
            </button>
            <form ref={formRef} onSubmit={submit} noValidate className="nx-client-form">
              {Object.keys(errors).length > 0 && (
                <div role="alert" className="nx-feedback nx-feedback-error" tabIndex={-1}>
                  <p>Confira os campos antes de salvar:</p>
                  <ul>
                    {Object.entries(errors).map(([name, message]) => (
                      <li key={name}>
                        <a
                          href={`#${fieldId(name)}`}
                          onClick={(event) => {
                            event.preventDefault();
                            document.getElementById(fieldId(name))?.focus();
                          }}
                        >
                          {labels[name] ?? name}: {message}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {mutation.isError && (
                <div
                  ref={feedback}
                  tabIndex={-1}
                  role="alert"
                  className="nx-feedback nx-feedback-error"
                >
                  <p>{mutation.error.message}</p>
                  {base && (
                    <ActionButton variant="ghost" loading={comparing} onClick={compare}>
                      Comparar com a versão salva
                    </ActionButton>
                  )}
                </div>
              )}
              {compareError !== null && <ErrorState error={compareError} onRetry={compare} />}
              {comparison && (
                <section
                  aria-label="Comparação com o cadastro salvo"
                  className="rounded border border-border p-3"
                >
                  <p className="font-medium">
                    Versão salva {comparison.version} · seu preenchimento continua no formulário
                  </p>
                  <dl className="mt-2 space-y-2 text-sm">
                    {Object.entries(initialValues(grupo, comparison))
                      .filter(([, value]) => value)
                      .map(([name, value]) => (
                        <div key={name}>
                          <dt className="text-muted-foreground">{labels[name]}</dt>
                          <dd className="break-words">{value}</dd>
                        </div>
                      ))}
                  </dl>
                  <ActionButton
                    variant="ghost"
                    className="mt-3"
                    onClick={() => {
                      setBase(comparison);
                      if (!archive) setValues(initialValues(grupo, comparison));
                      setComparison(null);
                      setMarcaUpload(undefined);
                      setRemoverMarca(false);
                      if (marcaInput.current) marcaInput.current.value = "";
                      setErrors({});
                      mutation.reset();
                    }}
                  >
                    Recarregar campos com a versão salva
                  </ActionButton>
                </section>
              )}
              {(archive ? ["motivo"] : fieldSets[grupo]).map((name) => {
                const required = ["nome", "razao_social", "motivo"].includes(name);
                const description =
                  name === "cnpj"
                    ? "Letras e números são aceitos. A representação informada será preservada; a comparação de duplicidade desconsidera pontuação."
                    : name === "distancia_ida_volta_km"
                      ? "Estimativa de referência; não representa quilometragem realizada."
                      : name === "unidade_id"
                        ? "Opcional. Selecione uma unidade deste cliente; o contato não recebe acesso de usuário."
                        : null;
                const describedBy =
                  [description && `${fieldId(name)}-help`, errors[name] && `${fieldId(name)}-error`]
                    .filter(Boolean)
                    .join(" ") || undefined;
                return (
                  <div
                    key={name}
                    className={
                      name === "observacoes" || name === "motivo"
                        ? "nx-client-field nx-client-field-wide"
                        : "nx-client-field"
                    }
                  >
                    <label htmlFor={fieldId(name)}>
                      {labels[name]}
                      {required && <span aria-hidden="true"> *</span>}
                    </label>
                    {name === "unidade_id" ? (
                      <UnidadeSelector
                        org={org}
                        cliente={cliente!}
                        value={values[name] ?? ""}
                        current={base && "unidade_id" in base ? (base as Contato) : null}
                        onChange={(value) => set(name, value)}
                        id={fieldId(name)}
                        describedBy={describedBy}
                        invalid={!!errors[name]}
                        disabled={mutation.isPending}
                      />
                    ) : name === "observacoes" || name === "motivo" ? (
                      <textarea
                        id={fieldId(name)}
                        value={values[name] ?? ""}
                        onChange={(event) => set(name, event.target.value)}
                        maxLength={name === "motivo" ? 1000 : 4000}
                        rows={3}
                        required={required}
                        aria-invalid={!!errors[name]}
                        aria-describedby={describedBy}
                        disabled={mutation.isPending}
                      />
                    ) : (
                      <input
                        id={fieldId(name)}
                        value={values[name] ?? ""}
                        onChange={(event) => set(name, event.target.value)}
                        required={required}
                        type={name === "email" ? "email" : "text"}
                        inputMode={
                          name === "distancia_ida_volta_km"
                            ? "decimal"
                            : name === "telefone"
                              ? "tel"
                              : undefined
                        }
                        maxLength={
                          name === "uf"
                            ? 2
                            : name === "cnpj"
                              ? 32
                              : name === "email"
                                ? 254
                                : name === "telefone"
                                  ? 40
                                  : name === "endereco"
                                    ? 500
                                    : name === "nome" ||
                                        name === "razao_social" ||
                                        name === "nome_exibicao"
                                      ? 200
                                      : name === "cidade"
                                        ? 100
                                        : undefined
                        }
                        aria-invalid={!!errors[name]}
                        aria-describedby={describedBy}
                        disabled={mutation.isPending}
                      />
                    )}
                    {description && (
                      <p id={`${fieldId(name)}-help`} className="text-xs text-muted-foreground">
                        {description}
                      </p>
                    )}
                    {errors[name] && (
                      <p id={`${fieldId(name)}-error`} className="text-sm text-destructive">
                        {errors[name]}
                      </p>
                    )}
                  </div>
                );
              })}
              {grupo === "clientes" && !archive && (
                <section
                  className="nx-client-field nx-client-field-wide nx-client-brand-field"
                  aria-label="Identidade visual do cliente"
                >
                  <label htmlFor={fieldId("marca")}>Marca do cliente</label>
                  {marcaPreview && (
                    <img
                      src={marcaPreview}
                      alt="Prévia da marca do cliente"
                      className="nx-client-brand-preview"
                      data-surface={marcaUpload?.superficie ?? marcaAtual?.superficie ?? "clara"}
                    />
                  )}
                  <input
                    id={fieldId("marca")}
                    ref={marcaInput}
                    type="file"
                    accept="image/png,image/jpeg,.png,.jpg,.jpeg"
                    disabled={mutation.isPending || marcaLendo}
                    aria-describedby={`${fieldId("marca")}-help${errors["marca"] ? ` ${fieldId("marca")}-error` : ""}`}
                    aria-invalid={!!errors["marca"]}
                    onChange={async (event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      setMarcaLendo(true);
                      setErrors((current) => {
                        const next = { ...current };
                        delete next["marca"];
                        return next;
                      });
                      try {
                        if (
                          !["image/png", "image/jpeg"].includes(file.type) ||
                          file.size > CLIENTE_MARCA_MAX_BYTES ||
                          !file.size
                        )
                          throw new Error("Escolha uma marca PNG ou JPEG de até 1 MiB.");
                        const url = await new Promise<string>((resolve, reject) => {
                          const reader = new FileReader();
                          reader.onload = () => resolve(String(reader.result));
                          reader.onerror = () =>
                            reject(
                              new Error(
                                "Não foi possível ler a marca. Tente selecionar o arquivo novamente.",
                              ),
                            );
                          reader.readAsDataURL(file);
                        });
                        const image = new Image();
                        image.src = url;
                        await image.decode();
                        if (
                          !image.naturalWidth ||
                          !image.naturalHeight ||
                          image.naturalWidth > 8192 ||
                          image.naturalHeight > 8192
                        )
                          throw new Error("A marca deve ter até 8192 × 8192 px.");
                        setMarcaUpload({
                          nome: file.name,
                          mime: file.type as "image/png" | "image/jpeg",
                          base64: url.slice(url.indexOf(",") + 1),
                          superficie: marcaAtual?.superficie ?? "clara",
                        });
                        setRemoverMarca(false);
                      } catch (cause) {
                        if (marcaInput.current) marcaInput.current.value = "";
                        setErrors((current) => ({
                          ...current,
                          marca: cause instanceof Error ? cause.message : "Imagem inválida.",
                        }));
                      } finally {
                        setMarcaLendo(false);
                      }
                    }}
                  />
                  <p id={`${fieldId("marca")}-help`} className="text-xs text-muted-foreground">
                    PNG ou JPEG de até 1 MiB. Preserve a proporção e a transparência da marca
                    oficial. A alteração só é aplicada ao salvar o cadastro.
                  </p>
                  {marcaUpload && (
                    <fieldset className="nx-client-brand-surface">
                      <legend>Superfície da marca</legend>
                      {(["clara", "escura"] as const).map((surface) => (
                        <label key={surface}>
                          <input
                            type="radio"
                            name={`${id}-marca-superficie`}
                            checked={(marcaUpload.superficie ?? "clara") === surface}
                            disabled={mutation.isPending}
                            onChange={() =>
                              setMarcaUpload((current) =>
                                current ? { ...current, superficie: surface } : current,
                              )
                            }
                          />
                          {surface === "clara" ? "Clara" : "Escura"}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  {(marcaAtual || marcaUpload) && (
                    <ActionButton
                      variant="ghost"
                      disabled={mutation.isPending || marcaLendo}
                      onClick={() => {
                        setMarcaUpload(undefined);
                        if (marcaInput.current) {
                          marcaInput.current.value = "";
                          marcaInput.current.focus();
                        }
                        setRemoverMarca(marcaAtual ? !removerMarca : false);
                        setErrors((current) => {
                          const next = { ...current };
                          delete next["marca"];
                          return next;
                        });
                      }}
                    >
                      {removerMarca ? "Manter marca salva" : "Remover marca"}
                    </ActionButton>
                  )}
                  <p role="status" className="text-sm text-muted-foreground">
                    {marcaLendo
                      ? "Verificando imagem…"
                      : marcaUpload
                        ? `Nova marca selecionada: ${marcaUpload.nome}`
                        : removerMarca
                          ? "A marca será removida ao salvar."
                          : ""}
                  </p>
                  {errors["marca"] && (
                    <p
                      id={`${fieldId("marca")}-error`}
                      role="alert"
                      className="text-sm text-destructive"
                    >
                      {errors["marca"]}
                    </p>
                  )}
                </section>
              )}
              <div className="nx-client-form-actions">
                <span className="mr-auto text-xs text-muted-foreground" role="status">
                  {mutation.isPending
                    ? "Salvando no servidor…"
                    : dirty
                      ? "Alterações ainda não salvas"
                      : base
                        ? `Versão ${base.version}`
                        : "Novo cadastro"}
                </span>
                <ActionButton variant="ghost" disabled={mutation.isPending} onClick={close}>
                  Cancelar
                </ActionButton>
                <ActionButton
                  type="submit"
                  loading={mutation.isPending}
                  disabled={marcaLendo}
                  variant={archive && !replacing ? "danger" : "primary"}
                >
                  {archive ? (replacing ? "Reativar" : "Arquivar") : "Salvar cadastro"}
                </ActionButton>
              </div>
            </form>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <AlertDialog.Root
        open={discard || blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) keep();
        }}
      >
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="nx-prompt-overlay" />
          <AlertDialog.Content className="nexus-operational nx-prompt-dialog nx-cadastro-confirm">
            <AlertDialog.Title>Descartar alterações não salvas?</AlertDialog.Title>
            <AlertDialog.Description>
              Seu preenchimento ainda não foi confirmado no servidor. Continue editando para
              preservá-lo ou descarte para sair.
            </AlertDialog.Description>
            <div className="mt-4 flex flex-wrap justify-end gap-2">
              <AlertDialog.Cancel asChild>
                <ActionButton onClick={keep}>Continuar editando</ActionButton>
              </AlertDialog.Cancel>
              <AlertDialog.Action asChild>
                <ActionButton variant="danger" onClick={abandon}>
                  Descartar e sair
                </ActionButton>
              </AlertDialog.Action>
            </div>
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </>
  );
}

function UnidadeSelector({
  org,
  cliente,
  value,
  current,
  onChange,
  id,
  describedBy,
  invalid,
  disabled,
}: {
  org: string;
  cliente: string;
  value: string;
  current: Contato | null;
  onChange: (value: string) => void;
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  disabled: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const query = useCadastroList(
    org,
    "unidades",
    cliente,
    useDebouncedSearch(search),
    "ativos",
    page,
  );
  const option = query.data?.rows.find((row) => row.id === value);
  return (
    <div className="space-y-2">
      <label className="sr-only" htmlFor={`${id}-search`}>
        Buscar unidade de atuação
      </label>
      <input
        id={`${id}-search`}
        type="search"
        value={search}
        maxLength={120}
        placeholder="Buscar unidade"
        onChange={(event) => {
          setSearch(event.target.value);
          setPage(0);
        }}
        disabled={disabled}
      />
      <select
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
        aria-describedby={describedBy}
        disabled={disabled || query.isPending || query.isError}
      >
        <option value="">Sem unidade específica</option>
        {value && !option && (
          <option value={value}>
            {current?.unidade_nome || "Unidade vinculada anteriormente"}
          </option>
        )}
        {query.data?.rows.map((unit) => (
          <option value={unit.id} key={unit.id}>
            {unit.nome}
          </option>
        ))}
      </select>
      {query.isPending && (
        <p role="status" className="text-xs text-muted-foreground">
          Carregando unidades…
        </p>
      )}
      {query.isError && <ErrorState error={query.error} onRetry={() => query.refetch()} />}
      {query.data && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{query.data.total} unidade(s) encontrada(s)</span>
          <button
            type="button"
            disabled={page === 0 || disabled}
            onClick={() => setPage(page - 1)}
            className="min-h-10 px-2 underline"
          >
            Anteriores
          </button>
          <button
            type="button"
            disabled={(page + 1) * 25 >= query.data.total || disabled}
            onClick={() => setPage(page + 1)}
            className="min-h-10 px-2 underline"
          >
            Próximas
          </button>
        </div>
      )}
    </div>
  );
}
