import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ActionButton, Section } from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { administrarVinculo } from "./admin.functions";
import { fieldClass, useCommandKey } from "./components";

export function AdminVinculos() {
  const org = useOrg();
  const qc = useQueryClient();
  const execute = useServerFn(administrarVinculo);
  const keyFor = useCommandKey();
  const [user, setUser] = useState("");
  const [nome, setNome] = useState("");
  const [papel, setPapel] = useState<
    "campo" | "engenharia" | "compras" | "financeiro" | "comercial" | "admin"
  >("campo");
  const [pessoa, setPessoa] = useState("");
  const [busy, setBusy] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const field = useRef<HTMLInputElement>(null);
  if (!org.data?.isAdmin) return null;
  const orgId = org.data.orgId;
  return (
    <Section
      title="Vincular conta existente"
      description="O titular cria a conta no provedor. O administrador vincula o identificador da conta à organização e à pessoa operacional correspondente."
    >
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setErro(null);
          setStatus("");
          if (
            !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user.trim())
          ) {
            setErro("Informe o identificador UUID da conta existente.");
            field.current?.focus();
            return;
          }
          if (nome.trim().length < 2) {
            setErro("Informe o nome do membro.");
            return;
          }
          setBusy(true);
          try {
            const dados = {
              user_id: user.trim(),
              nome: nome.trim(),
              role: papel,
              habilitar: true,
              ...(pessoa.trim() ? { pessoa_id: pessoa.trim() } : {}),
            };
            await execute({
              data: { organization_id: orgId, chave: keyFor(dados), comando: "vincular", dados },
            });
            await qc.invalidateQueries({ queryKey: ["membros", orgId] });
            await qc.invalidateQueries({ queryKey: ["pessoas", orgId] });
            setStatus(
              "Vínculo confirmado no servidor. Confira os papéis e a capacidade operacional na lista de membros.",
            );
            setUser("");
            setNome("");
            setPessoa("");
          } catch (e) {
            setErro(
              e instanceof Error
                ? e.message
                : "Não foi possível vincular. Confira os dados e tente novamente.",
            );
          } finally {
            setBusy(false);
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            Identificador da conta (UUID) *
            <input
              ref={field}
              className={fieldClass}
              value={user}
              onChange={(e) => setUser(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="text-sm">
            Nome do membro *
            <input className={fieldClass} value={nome} onChange={(e) => setNome(e.target.value)} />
          </label>
          <label className="text-sm">
            Papel inicial
            <select
              className={fieldClass}
              value={papel}
              onChange={(e) => setPapel(e.target.value as typeof papel)}
            >
              {["campo", "engenharia", "compras", "financeiro", "comercial", "admin"].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            Pessoa existente (UUID, opcional)
            <input
              className={fieldClass}
              value={pessoa}
              onChange={(e) => setPessoa(e.target.value)}
              autoComplete="off"
            />
          </label>
        </fieldset>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        {status && (
          <p role="status" className="text-sm">
            {status}
          </p>
        )}
        <ActionButton type="submit" loading={busy}>
          Vincular conta
        </ActionButton>
        <p className="text-xs text-muted-foreground">
          Envio de convite por e-mail: integração não configurada. Este vínculo administrativo
          funciona com uma conta existente e não envia e-mail nem cria senha.
        </p>
      </form>
    </Section>
  );
}
