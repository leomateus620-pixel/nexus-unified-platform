import assert from "node:assert/strict";
import { test } from "node:test";
import { prepareMappings, projectRecords, stableId } from "./prepare-import.mjs";

const ORG = "12345678-0000-4000-8000-000000000001";
const client = {
  id: "c-origem",
  razao_social: "Cliente Alfa Ltda.",
  nome_fantasia: "Álfa",
  cnpj_matriz: "",
  unidades: [{ id: "u-origem", nome: "Unidade Alfa", cnpj: "12.345.678/0002-99" }],
};
const scope = { cliente_id: "c-origem", unidade_id: "u-origem" };

function source() {
  return {
    clientes: [
      client,
      { id: "c-demo", exemplo: true, unidades: [{ id: "u-demo", exemplo: true }] },
    ],
    locais: [{ id: "l-demo", exemplo: true, unidade_id: "u-demo" }],
    documentos: [
      { ...scope, id: "d-principal", titulo: "Original", estado: "emitido", historico: [] },
      {
        ...scope,
        id: "d-complemento",
        titulo: "Complemento",
        estado: "recebido",
        documento_principal_id: "d-principal",
        historico: [],
      },
    ],
    insp_ativos: [
      {
        ...scope,
        id: "a-atual",
        tag: "ANC-1",
        vigente: true,
        situacao_sistema: "existente",
        documento_ids: ["d-complemento"],
        local: "setor preservado",
      },
      {
        ...scope,
        id: "a-anterior",
        tag: "ANC-1",
        vigente: false,
        situacao_sistema: "existente",
        documento_ids: ["d-principal"],
      },
      {
        ...scope,
        id: "a-ausente",
        tag: "ANC-2",
        vigente: true,
        situacao_sistema: "inexistente",
        documento_ids: ["d-principal"],
      },
    ],
    insp_inspecoes: [
      {
        ...scope,
        id: "i-01",
        data: "2024-02-29",
        data_precisao: "dia",
        ativo_id: "a-atual",
        documento_id: "d-complemento",
        situacao: "importada",
        historico: [],
      },
    ],
    insp_avisos: [
      {
        ...scope,
        id: "aviso-1",
        documento_id: "d-principal",
        regra: "R64",
        vence: "2025-02-28",
        envios: [{ modo: "simulado" }],
      },
    ],
    insp_plantas: [
      {
        ...scope,
        id: "p-01",
        documento_id: "d-principal",
        fundo: { arquivo: "plantas/fundo.json" },
        pontos: [{ ativo_id: "a-atual", x: 23, y: 54, raio: 0.7 }],
      },
    ],
    pendencias: [],
    insp_importacoes: [],
    insp_equipamentos: [],
    insp_servicos: [],
    insp_familias: [],
    insp_regras: [],
    insp_parametros: [],
    insp_textos_padrao: [],
    insp_contratos: [],
    insp_ensaios: [],
    insp_os: [],
    insp_catalogo: { pacotes: [{ codigo: "P1", nome: "Pacote" }], matriz: { linhas: [] } },
    insp_listas: { tipo_inspecao: [{ valor: "T1", rotulo: "Tipo 1" }] },
    meta: { versao_base: 1 },
    modelos_documento: [],
    projeto: {},
    cliente_ativo: "c-demo",
    unidade_ativa: "u-demo",
    log: [{ data: "2026-11-01T10:00:00-03:00", autor: "Origem", acao: "Entrada" }],
  };
}

test("mapeamento determinístico conserva CNPJ de filial como indício para revisão", () => {
  const fixture = source();
  const candidates = [
    {
      id: "id-candidato",
      nome_exibicao: "Outra marca",
      identificador_normalizado: "12345678000100",
    },
  ];
  assert.deepEqual(prepareMappings(fixture, ORG, candidates), [
    {
      cliente_source_id: "c-origem",
      unidade_source_id: "u-origem",
      decisao: "conferir",
      candidatos: ["id-candidato"],
    },
  ]);
  const decisions = prepareMappings(fixture, ORG, []);
  assert.equal(decisions.length, 1);
  assert.equal(decisions[0].decisao, "criar");
  assert.equal(decisions[0].cliente_id, stableId(ORG + ":cliente:" + client.id));
  assert.notEqual(decisions[0].cliente_id, decisions[0].unidade_id);
  assert.deepEqual(decisions, prepareMappings(fixture, ORG, []));
});

test("acervo conserva TAG repetida, precisão civil, histórico vazio e envios de simulação", () => {
  const background = { paths: [], textos: [], area: [0, 0, 80, 80] };
  const { records, relations } = projectRecords(source(), new Map([["p-01", background]]));
  const assets = records.filter((row) => row.colecao === "ativos");
  assert.equal(assets.length, 3);
  assert.equal(assets.filter((asset) => asset.codigo === "ANC-1").length, 2);
  assert.deepEqual(
    assets.filter((row) => row.vigente && row.existente).map((row) => row.source_id),
    ["a-atual"],
  );
  assert.equal(assets[0].snapshot.local, "setor preservado");
  assert.equal(records.filter((row) => row.colecao === "demonstracao").length, 2);
  const history = records.find((row) => row.colecao === "inspecoes");
  assert.equal(history.data_ref, "2024-02-29");
  assert.deepEqual(history.snapshot.historico, []);
  assert.equal(records.find((row) => row.colecao === "avisos").snapshot.envios[0].modo, "simulado");
  assert.deepEqual(records.find((row) => row.colecao === "plantas").snapshot.geometria, background);
  assert.ok(
    relations.some(
      ({ snapshot }) => snapshot.origem_id === "d-complemento" && snapshot.tipo === "principal",
    ),
  );
  assert.ok(
    relations.some(
      ({ snapshot }) => snapshot.origem_id === "p-01" && snapshot.destino_id === "a-atual",
    ),
  );
  assert.ok(
    relations.some(
      ({ snapshot }) => snapshot.origem_id === "i-01" && snapshot.destino_id === "a-atual",
    ),
  );
});

test("plantas exigem fundo declarado e vínculos da mesma unidade", () => {
  const fixture = source();
  assert.throws(() => projectRecords(fixture), /Fundo vetorial declarado indisponível/);
  fixture.insp_plantas[0].pontos[0].ativo_id = "ativo-nao-existente";
  assert.throws(() => projectRecords(fixture, new Map([["p-01", {}]])), /Vínculo inválido/);
});
