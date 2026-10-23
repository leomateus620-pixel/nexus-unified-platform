import { useEffect, useState } from "react";
import { ActionButton } from "@/components/nexus/Page";
import { useOrg } from "@/features/org/session";
import { petObterPacote } from "./documentos.functions";
import { petExecutar, petObter } from "./pet.functions";
import {
  adicionarPendente,
  confirmarPendenteLocal,
  mesclarPacoteLocal,
  abrirPacote,
  chavePacote,
  protegerPacote,
  type PacoteLocal,
} from "./offline";
import { baixarBytes } from "./PetDocumentos";
import { visualizadorProtegido } from "./offline-viewer";

export function PetContingencia({
  organizationId,
  petId,
}: {
  organizationId: string;
  petId: string;
  version?: number;
}) {
  const org = useOrg(),
    userId = org.data?.userId ?? "";
  const storageKey = chavePacote(organizationId, userId, petId);
  const [senha, setSenha] = useState(""),
    [pacote, setPacote] = useState<PacoteLocal | null>(null);
  const [mensagem, setMensagem] = useState(""),
    [busy, setBusy] = useState(false);
  const [pessoa, setPessoa] = useState(""),
    [motivo, setMotivo] = useState("");
  useEffect(
    () => () => {
      setPacote(null);
      setSenha("");
    },
    [organizationId, userId, petId],
  );
  async function persistir(p: PacoteLocal) {
    const cipher = await protegerPacote(p, senha);
    localStorage.setItem(storageKey, cipher);
    setPacote(p);
  }
  async function preparar() {
    setBusy(true);
    setMensagem("");
    try {
      if (senha.length < 12) throw new Error("Use uma senha local com ao menos 12 caracteres.");
      if (localStorage.getItem(storageKey))
        throw new Error(
          "Abra a cópia existente antes de substituí-la; registros pendentes precisam ser preservados.",
        );
      const p = await petObterPacote({ data: { organization_id: organizationId, id: petId } });
      await persistir(p);
      setMensagem("Pacote original protegido salvo neste dispositivo. Guarde a senha local.");
    } catch (e) {
      setMensagem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function abrir() {
    setBusy(true);
    setMensagem("");
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) throw new Error("Nenhum pacote protegido neste dispositivo.");
      setPacote(await abrirPacote(raw, senha, { organizationId, userId, petId }));
    } catch (e) {
      setMensagem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function baixarArquivo(conteudo: string, nome: string, mime: string) {
    const url = URL.createObjectURL(new Blob([conteudo], { type: mime }));
    const a = document.createElement("a");
    a.href = url;
    a.download = nome;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  async function importar(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setMensagem("");
    try {
      if (file.size > 30 * 1024 * 1024) throw new Error("O pacote excede 30 MiB.");
      const p = await abrirPacote(await file.text(), senha, { organizationId, userId, petId });
      const stored = localStorage.getItem(storageKey);
      const current =
        pacote ??
        (stored ? await abrirPacote(stored, senha, { organizationId, userId, petId }) : null);
      await persistir(mesclarPacoteLocal(current, p));
      setMensagem("Cópia importada. Os fatos permanecem pendentes até confirmação do servidor.");
    } catch (e) {
      setMensagem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function registrar(tipo: "registrar_saida" | "interromper") {
    if (!pacote) return;
    setBusy(true);
    setMensagem("");
    try {
      await persistir(
        adicionarPendente(pacote, {
          chave: crypto.randomUUID(),
          tipo,
          ...(tipo === "registrar_saida" ? { pessoa_id: pessoa } : {}),
          momento: new Date().toISOString(),
          motivo,
          origem: "offline",
          estado: "pendente",
        }),
      );
      setMensagem(
        "Fato preservado localmente; ainda não confirmado no servidor. Assinatura pendente.",
      );
      setMotivo("");
    } catch (e) {
      setMensagem((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function sincronizar() {
    if (!pacote) return;
    setBusy(true);
    setMensagem("");
    let atual = pacote;
    try {
      for (const r of pacote.pendentes) {
        const detalhe = await petObter({ data: { organization_id: organizationId, id: petId } });
        const version = r.expected_version ?? Number(detalhe.pet["version"]);
        // Save the exact first request before sending. A lost response must replay
        // the same key AND payload, including expected_version.
        atual = {
          ...atual,
          pendentes: atual.pendentes.map((p) =>
            p.chave === r.chave ? { ...p, expected_version: version } : p,
          ),
        };
        await persistir(atual);
        try {
          await petExecutar({
            data: {
              organization_id: organizationId,
              comando: {
                chave: r.chave,
                comando: r.tipo,
                dados: {
                  pet_id: petId,
                  expected_version: version,
                  momento: r.momento,
                  origem: r.origem,
                  motivo: r.motivo,
                  ...(r.pessoa_id ? { pessoa_id: r.pessoa_id } : {}),
                },
              },
            },
          });
          atual = confirmarPendenteLocal(atual, r.chave, new Date().toISOString());
          await persistir(atual);
        } catch (e) {
          atual = {
            ...atual,
            pendentes: atual.pendentes.map((p) =>
              p.chave === r.chave ? { ...p, estado: "conflito" } : p,
            ),
          };
          await persistir(atual);
          throw e;
        }
      }
      setMensagem(
        "Registros recebidos pelo servidor. Horários declarados e necessidade de conferência permanecem no histórico.",
      );
    } catch (e) {
      setMensagem(`Sincronização pendente: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  }
  const participantes = pacote?.snapshot["participantes"];
  const pessoas = Array.isArray(participantes)
    ? (participantes.filter((p) => p && typeof p === "object" && !Array.isArray(p)) as {
        pessoa_id: string;
        nome_snapshot: string;
      }[])
    : [];
  return (
    <details className="nx-pet-panel">
      <summary>Contingência e cópia protegida</summary>
      <p>
        Disponível após emissão, com original assinado. Não emite, libera entrada nem assina
        offline. Confira a adequação do dispositivo ao ambiente e o procedimento de contingência
        aprovado.
      </p>
      <label>
        Senha local (mínimo 12 caracteres)
        <input
          type="password"
          autoComplete="off"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
        />
      </label>
      <div className="flex flex-wrap gap-2">
        <ActionButton disabled={busy} onClick={() => void preparar()}>
          Preparar cópia com conexão
        </ActionButton>
        <ActionButton variant="ghost" disabled={busy} onClick={() => void abrir()}>
          Abrir cópia protegida
        </ActionButton>
      </div>
      <label>
        Importar registros de contingência (JSON cifrado)
        <input
          type="file"
          accept="application/json,.json"
          disabled={busy}
          onChange={(e) => void importar(e.target.files?.[0])}
        />
      </label>
      {mensagem && <p role="status">{mensagem}</p>}
      {pacote && (
        <>
          <p>
            Versão {pacote.version} · última sincronização{" "}
            {new Date(pacote.sincronizadoEm).toLocaleString("pt-BR")}
          </p>
          <p className="break-all">Original SHA-256: {pacote.documentoHash}</p>
          <ActionButton
            variant="ghost"
            onClick={() => baixarBytes(pacote.pdf, `${petId}-original-local.pdf`)}
          >
            Consultar documento local
          </ActionButton>
          <ActionButton
            variant="ghost"
            onClick={() => {
              const raw = localStorage.getItem(storageKey);
              if (raw)
                baixarArquivo(
                  visualizadorProtegido(raw),
                  `${petId}-contingencia-protegida.html`,
                  "text/html",
                );
            }}
          >
            Salvar visualizador protegido para abrir sem rede
          </ActionButton>
          <p>
            Salve o HTML protegido e teste sua abertura antes da operação. Ele permite consultar o
            original e preservar fatos mesmo sem carregar a Nexus. Registros exportados devem ser
            importados aqui após reconexão.
          </p>
          <label>
            Pessoa que saiu
            <select value={pessoa} onChange={(e) => setPessoa(e.target.value)}>
              <option value="">Selecionar pessoa</option>
              {pessoas.map((p, i) => (
                <option key={`${p.pessoa_id}-${i}`} value={p.pessoa_id}>
                  {p.nome_snapshot}
                </option>
              ))}
            </select>
          </label>
          <label>
            Contexto do fato ou ocorrência
            <textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} />
          </label>
          <div className="flex flex-wrap gap-2">
            <ActionButton disabled={busy} onClick={() => void registrar("registrar_saida")}>
              Preservar saída local
            </ActionButton>
            <ActionButton
              disabled={busy}
              variant="ghost"
              onClick={() => void registrar("interromper")}
            >
              Preservar ocorrência local
            </ActionButton>
          </div>
          <ul>
            {pacote.pendentes.map((r) => (
              <li key={r.chave}>
                {r.tipo === "registrar_saida" ? "Saída" : "Ocorrência"} ·{" "}
                {new Date(r.momento).toLocaleString("pt-BR")} ·{" "}
                {r.estado === "conflito"
                  ? "Conferência necessária; sem confirmação"
                  : "Pendente no dispositivo"}
              </li>
            ))}
          </ul>
          <ActionButton
            disabled={busy || !pacote.pendentes.length}
            onClick={() => void sincronizar()}
          >
            Sincronizar fatos pendentes ({pacote.pendentes.length})
          </ActionButton>
          <ActionButton
            variant="ghost"
            onClick={() => {
              setPacote(null);
              setSenha("");
            }}
          >
            Bloquear cópia local
          </ActionButton>
        </>
      )}
    </details>
  );
}
