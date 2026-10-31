import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { buildApplicabilityManifest } from "../scripts/nr/prepare-applicability.mjs";
import { digest } from "../scripts/nr/inventory.mjs";

const pending = (id, description) => ({
  id,
  unidade_id: "und-camera-slg",
  local_id: "",
  titulo: `Synthetic ${id}`,
  descricao: description,
  autor_historico: "Autoria sintética",
  data: "2026-09-01",
  campo_desconhecido: false,
});
const source = {
  clientes: [{ id: "synthetic-client", unidades: [{ id: "und-camera-slg" }] }],
  pendencias: [
    pending("P09", "O PGSSTA menciona Santa Rosa em um cenário sintético."),
    pending("P-new", "Trabalho em altura, ancoragens e PGSSTA: texto novo sem decisão revisada."),
    pending("P19", "Menção ambígua em um cenário sintético."),
  ],
};
const mappings = [
  { tipo: "cliente", externo_id: "synthetic-client", destino_id: randomUUID() },
  { tipo: "unidade", externo_id: "und-camera-slg", destino_id: randomUUID() },
  ...source.pendencias.map((p) => ({
    tipo: "pendencia",
    externo_id: `und-camera-slg/${p.id}`,
    destino_id: randomUUID(),
  })),
];

test("manifesto só amplia a decisão explicitamente revisada, nunca por menção textual", () => {
  const before = structuredClone(source),
    result = buildApplicabilityManifest(source, mappings);
  const byId = new Map(result.entradas.map((row) => [row.externo_id, row]));
  assert.deepEqual(byId.get("und-camera-slg/P09").normas, ["NR33", "NR35"]);
  assert.deepEqual(byId.get("und-camera-slg/P-new").normas, ["NR33"]);
  assert.equal(byId.get("und-camera-slg/P19").decisao, "revisao_pendente");
  assert.equal(byId.get("und-camera-slg/P09").fonte_sha256, digest(source.pendencias[0]));
  assert.equal(result.aprovacao_profissional, false);
  assert.equal(result.emissao_operacional, false);
  assert.deepEqual(source, before);
});
test("reordenação não muda identidade; alteração do snapshot desconhecido muda o hash", () => {
  const result = buildApplicabilityManifest(source, mappings);
  assert.equal(
    buildApplicabilityManifest(
      { ...source, pendencias: [...source.pendencias].reverse() },
      mappings,
    ).sha256,
    result.sha256,
  );
  const changed = structuredClone(source);
  changed.pendencias[0].campo_desconhecido = true;
  assert.notEqual(buildApplicabilityManifest(changed, mappings).sha256, result.sha256);
});
test("fonte ou vínculo divergente impede preparar uma decisão sem prova", () => {
  const changed = structuredClone(source);
  changed.pendencias[0].descricao = "Outro conteúdo sem o trecho revisado.";
  assert.throws(() => buildApplicabilityManifest(changed, mappings), /Trecho da decisão/);
  assert.throws(
    () =>
      buildApplicabilityManifest(
        source,
        mappings.filter((row) => row.tipo !== "pendencia"),
      ),
    /Identidade não conciliada/,
  );
  assert.throws(
    () => buildApplicabilityManifest(source, mappings, { requireReviewed: true }),
    /Fonte da decisão explícita ausente/,
  );
});
