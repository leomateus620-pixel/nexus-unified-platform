import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { ActionButton, Section } from "@/components/nexus/Page";
import { EntityPicker } from "@/components/nexus/EntityPicker";
import { useCommandKey } from "@/features/operacao/components";
import {
  adotarMedidasLevantamento,
  buscarSistemasAdocaoLevantamento,
  previaAdocaoLevantamento,
} from "./levantamentos.functions";
import { invalidarLevantamentos } from "./queries";
import { medicaoAdotavel } from "./domain";
import type { LevantamentoDetalhe, PreviaAdocaoLevantamento } from "./types";

export function AdocaoLevantamento({ org, detail }: { org: string; detail: LevantamentoDetalhe }) {
  const [campo, setCampo] = useState<"metragem" | "trechos">("metragem");
  const [medicao, setMedicao] = useState("");
  const [sistema, setSistema] = useState("");
  const [preview, setPreview] = useState<PreviaAdocaoLevantamento | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [adotado, setAdotado] = useState<PreviaAdocaoLevantamento | null>(null);
  const guard = useRef(false);
  const client = useQueryClient();
  const keyFor = useCommandKey();
  const loadSystems = useServerFn(buscarSistemasAdocaoLevantamento);
  const getPreview = useServerFn(previaAdocaoLevantamento);
  const adopt = useServerFn(adotarMedidasLevantamento);
  const options = detail.medicoes.filter((m) => medicaoAdotavel(m, detail.revisao.estado, campo));
  const body = {
    organization_id: org,
    revisao_id: detail.revisao.id,
    medicao_id: medicao,
    sistema_id: sistema,
    campo,
  };
  const reset = () => {
    setPreview(null);
    setNotice("");
    setError(null);
  };
  async function work(adotar: boolean) {
    if (guard.current) return;
    if (!medicao || !sistema) {
      setError(new Error("Selecione a medida de origem e o sistema de destino."));
      return;
    }
    guard.current = true;
    setBusy(true);
    setError(null);
    setNotice("");
    try {
      if (!adotar) {
        setPreview(await getPreview({ data: body }));
        return;
      }
      if (!preview) throw new Error("Compare os valores antes de adotar.");
      const payload = { ...body, preview_hash: preview.preview_hash };
      const result = await adopt({ data: { ...payload, chave: keyFor(payload) } });
      await invalidarLevantamentos(client, org, result.revisao_destino_id);
      setAdotado(preview);
      setPreview(null);
      setNotice(
        "Medida adotada no rascunho. Abra a revisão de destino e recalcule com o motor canônico antes de prosseguir com o orçamento.",
      );
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Não foi possível confirmar a adoção."));
    } finally {
      guard.current = false;
      setBusy(false);
    }
  }
  return (
    <Section
      title="Adotar no dimensionamento"
      description="Altera somente o sistema escolhido em uma revisão comercial editável, após comparação no servidor."
    >
      <fieldset disabled={busy} className="space-y-4 min-w-0">
        <div className="nx-lev-form-grid">
          <label className="nx-lev-label">
            Campo de destino
            <select
              className="nx-lev-input"
              value={campo}
              onChange={(e) => {
                setCampo(e.target.value as typeof campo);
                setMedicao("");
                reset();
              }}
            >
              <option value="metragem">Metragem do sistema (m)</option>
              <option value="trechos">Quantidade de trechos (un)</option>
            </select>
          </label>
          <label className="nx-lev-label">
            Medida aprovada
            <select
              className="nx-lev-input"
              value={medicao}
              onChange={(e) => {
                setMedicao(e.target.value);
                reset();
              }}
            >
              <option value="">Selecione a origem</option>
              {options.map((m) => (
                <option key={m.id} value={m.id}>
                  {detail.pontos.find((p) => p.id === m.ponto_id)?.codigo} · {m.chave}:{" "}
                  {m.valor?.replace(".", ",")} {m.unidade}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!options.length && (
          <p className="text-sm text-muted-foreground">
            Esta revisão não tem medida coletada compatível com o campo escolhido. Estimativas e
            dados de modelo 3D não são adotados como medida confirmada.
          </p>
        )}
        <EntityPicker
          label="Sistema em proposta rascunho"
          value={sistema}
          queryKey={[
            "levantamento-opcoes",
            org,
            "sistemas",
            detail.levantamento.id,
            detail.revisao.id,
          ]}
          load={(busca, signal) =>
            loadSystems({
              data: {
                organization_id: org,
                levantamento_id: detail.levantamento.id,
                revisao_id: detail.revisao.id,
                busca,
              },
              signal,
            })
          }
          onChange={(row) => {
            setSistema(row?.id ?? "");
            reset();
          }}
          emptyHint="Nenhum sistema editável deste cliente e unidade. Cadastre-o em uma proposta rascunho para adotar medidas."
        />
        {error && (
          <p role="alert" className="rounded border border-destructive p-3 text-sm">
            {error.message} A origem e sua seleção foram preservadas; confira a comparação antes de
            tentar novamente.
          </p>
        )}
        <ActionButton
          variant="ghost"
          loading={busy}
          disabled={!medicao || !sistema}
          onClick={() => work(false)}
        >
          Comparar antes de adotar
        </ActionButton>
        {preview && (
          <div className="space-y-3 rounded border border-info p-3">
            <div
              role="region"
              aria-label="Comparação de valores para adoção"
              tabIndex={0}
              className="max-w-full overflow-auto"
            >
              <table className="nx-lev-comparison">
                <caption className="sr-only">
                  Valor atual e valor aprovado da revisão V{detail.revisao.numero}
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Campo</th>
                    <th scope="col">Valor atual</th>
                    <th scope="col">Valor do levantamento</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>{campo}</td>
                    <td>
                      {preview.atual.replace(".", ",")} {preview.unidade}
                    </td>
                    <td>
                      {preview.proposto.replace(".", ",")} {preview.unidade}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className="text-sm">
              Origem: {detail.levantamento.codigo} · V{detail.revisao.numero} ·{" "}
              {detail.medicoes.find((m) => m.id === medicao)?.chave}. O banco converte unidades
              compatíveis e confere a versão do destino.
            </p>
            <p className="text-sm">
              {preview.afetados.length} componentes vinculados a conferir no recálculo
              {preview.afetados.length
                ? `: ${preview.afetados.map((item) => item.codigo).join(", ")}`
                : "."}
            </p>
            <p className="text-xs text-muted-foreground">
              Adoção não altera revisão comercial enviada/aceita nem recalcula preços
              automaticamente.
            </p>
            <ActionButton loading={busy} onClick={() => work(true)}>
              Adotar medida no rascunho
            </ActionButton>
          </div>
        )}
        {notice && (
          <div role="status" className="space-y-2 rounded border border-primary p-3 text-sm">
            <p>{notice}</p>
            {adotado && (
              <Link
                className="text-primary underline underline-offset-4"
                to="/comercial/propostas/$propostaId/revisoes/$revisaoId/dimensionamento"
                params={{
                  propostaId: adotado.proposta_destino_id,
                  revisaoId: adotado.revisao_destino_id,
                }}
              >
                Abrir dimensionamento de destino
              </Link>
            )}
          </div>
        )}
      </fieldset>
    </Section>
  );
}
